import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'package:flutter/services.dart';
import '../models/server_model.dart';
import 'auth_service.dart';

enum VpnStatus {
  disconnected,
  connecting,
  connected,
  disconnecting,
  error
}

enum VpnMode {
  antizapret,
  fullVpn
}

class VpnService {
  static const _platform = MethodChannel('com.vpnapp/openvpn');
  
  VpnStatus _status = VpnStatus.disconnected;
  VpnMode _currentMode = VpnMode.antizapret;
  VpnServer? _currentServer;
  final _authService = AuthService();
  
  final _statusController = StreamController<VpnStatus>.broadcast();
  Stream<VpnStatus> get statusStream => _statusController.stream;
  
  VpnStatus get status => _status;
  VpnMode get currentMode => _currentMode;
  VpnServer? get currentServer => _currentServer;
  
  // Инициализация метода канала для получения обновлений статуса VPN
  Future<void> initialize() async {
    _platform.setMethodCallHandler((call) async {
      if (call.method == 'vpnStatusChanged') {
        final statusIndex = call.arguments['status'] as int;
        final newStatus = VpnStatus.values[statusIndex];
        _updateStatus(newStatus);
      }
    });
  }
  
  // Подключение к VPN серверу
  Future<bool> connect(VpnServer server, VpnMode mode) async {
    try {
      // Проверка авторизации
      if (!_authService.isAuthenticated) {
        throw Exception('Требуется авторизация для использования VPN');
      }

      _currentServer = server;
      _currentMode = mode;
      _updateStatus(VpnStatus.connecting);
      
      final configContent = mode == VpnMode.antizapret 
          ? server.antizapretConfig 
          : server.fullVpnConfig;
      
      final result = await _platform.invokeMethod('connectVpn', {
        'config': configContent,
        'name': '${server.ipAddress}_${mode.toString().split('.').last}',
        'authToken': _authService.currentUser?.activationKey
      });
      
      return result == true;
    } catch (e) {
      _updateStatus(VpnStatus.error);
      rethrow;
    }
  }
  
  // Отключение от VPN
  Future<bool> disconnect() async {
    try {
      _updateStatus(VpnStatus.disconnecting);
      final result = await _platform.invokeMethod('disconnectVpn');
      return result == true;
    } catch (e) {
      _updateStatus(VpnStatus.error);
      return false;
    }
  }
  
  // Измерение пинга до сервера
  Future<int> measurePing(String ipAddress) async {
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        final result = await _platform.invokeMethod('measurePing', {
          'ipAddress': ipAddress
        });
        
        return result as int;
      } else {
        // Для десктопных платформ используем другой подход
        final stopwatch = Stopwatch()..start();
        
        final socket = await Socket.connect(ipAddress, 80, 
          timeout: Duration(seconds: 2)
        ).catchError((_) {
          return null;
        });
        
        if (socket == null) return 999; // Условно большой пинг при ошибке
        
        socket.destroy();
        stopwatch.stop();
        
        return stopwatch.elapsedMilliseconds;
      }
    } catch (e) {
      return 999; // Условно большой пинг при ошибке
    }
  }
  
  // Обновление статуса VPN
  void _updateStatus(VpnStatus newStatus) {
    _status = newStatus;
    _statusController.add(newStatus);
  }
  
  // Освобождение ресурсов
  void dispose() {
    _statusController.close();
  }
} 