import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user_model.dart';

class AuthService {
  static const String _apiUrl = 'https://api.vpnservice.com'; // Заменить на реальный URL
  static const String _activationKeyPref = 'activation_key';
  static const String _userPref = 'user_data';
  
  User? _currentUser;
  String? _activationKey;
  
  User? get currentUser => _currentUser;
  bool get isAuthenticated => _currentUser != null && _currentUser!.isActive && !_currentUser!.isExpired;
  
  // Загрузка сохраненных данных
  Future<bool> loadStoredCredentials() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      
      _activationKey = prefs.getString(_activationKeyPref);
      final userJson = prefs.getString(_userPref);
      
      if (_activationKey != null && userJson != null) {
        _currentUser = User.fromJson(json.decode(userJson));
        
        // Проверка актуальности данных с сервером
        await verifyActivationStatus();
        
        return isAuthenticated;
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }
  
  // Активация приложения с помощью ключа
  Future<bool> activateWithKey(String activationKey) async {
    try {
      final response = await http.post(
        Uri.parse('$_apiUrl/activate'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'activationKey': activationKey}),
      );
      
      if (response.statusCode == 200) {
        final userData = json.decode(response.body);
        _currentUser = User.fromJson(userData['user']);
        _activationKey = activationKey;
        
        // Сохранение данных
        await _saveCredentials();
        
        return true;
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }
  
  // Проверка статуса активации на сервере
  Future<bool> verifyActivationStatus() async {
    if (_activationKey == null) return false;
    
    try {
      final response = await http.get(
        Uri.parse('$_apiUrl/verify/$_activationKey'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        final userData = json.decode(response.body);
        _currentUser = User.fromJson(userData['user']);
        
        // Обновление данных
        await _saveCredentials();
        
        return isAuthenticated;
      } else if (response.statusCode == 403 || response.statusCode == 404) {
        // Ключ недействителен или пользователь удален
        await logout();
      }
      
      return false;
    } catch (e) {
      // При ошибке сети используем кэшированные данные
      return isAuthenticated;
    }
  }
  
  // Выход из системы
  Future<void> logout() async {
    _currentUser = null;
    _activationKey = null;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_activationKeyPref);
    await prefs.remove(_userPref);
  }
  
  // Сохранение учетных данных
  Future<void> _saveCredentials() async {
    if (_currentUser == null || _activationKey == null) return;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_activationKeyPref, _activationKey!);
    await prefs.setString(_userPref, json.encode(_currentUser!.toJson()));
  }
} 