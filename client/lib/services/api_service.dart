import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/server_model.dart';

class ApiService {
  static const String _apiUrl = 'https://api.vpnservice.com'; // Заменить на реальный URL
  final String? _authToken;
  
  ApiService({String? authToken}) : _authToken = authToken;
  
  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
    };
    
    if (_authToken != null) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    
    return headers;
  }
  
  // Получение списка доступных серверов
  Future<List<VpnServer>> getServers() async {
    try {
      final response = await http.get(
        Uri.parse('$_apiUrl/servers'),
        headers: _headers,
      );
      
      if (response.statusCode == 200) {
        final List<dynamic> serversJson = json.decode(response.body)['servers'];
        return serversJson.map((json) => VpnServer.fromJson(json)).toList();
      }
      
      return [];
    } catch (e) {
      return [];
    }
  }
  
  // Получение конфигурационного файла для сервера
  Future<String?> getServerConfig(String serverId, bool isAntizapret) async {
    try {
      final endpoint = isAntizapret 
          ? '/servers/$serverId/antizapret-config' 
          : '/servers/$serverId/vpn-config';
          
      final response = await http.get(
        Uri.parse('$_apiUrl$endpoint'),
        headers: _headers,
      );
      
      if (response.statusCode == 200) {
        return response.body;
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }
  
  // Отправка статистики использования
  Future<bool> sendUsageStats(String serverId, VpnServer server) async {
    try {
      final response = await http.post(
        Uri.parse('$_apiUrl/stats'),
        headers: _headers,
        body: json.encode({
          'serverId': serverId,
          'ping': server.ping,
          'timestamp': DateTime.now().toIso8601String(),
        }),
      );
      
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
  
  // Проверка доступности сервера API
  Future<bool> checkApiAvailability() async {
    try {
      final response = await http.get(
        Uri.parse('$_apiUrl/health'),
        headers: _headers,
      ).timeout(Duration(seconds: 3));
      
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
} 