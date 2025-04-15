import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/vpn_service.dart';
import '../services/api_service.dart';

class SettingsScreen extends StatefulWidget {
  @override
  _SettingsScreenState createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _authService = AuthService();
  final _vpnService = VpnService();
  final _apiService = ApiService();
  
  bool _isLoading = false;
  bool _serverAvailable = true;
  DateTime? _lastSyncTime;
  
  @override
  void initState() {
    super.initState();
    _checkServerAvailability();
  }
  
  Future<void> _checkServerAvailability() async {
    setState(() {
      _isLoading = true;
    });
    
    final isAvailable = await _apiService.checkApiAvailability();
    setState(() {
      _serverAvailable = isAvailable;
      _lastSyncTime = DateTime.now();
      _isLoading = false;
    });
  }
  
  Future<void> _logout() async {
    setState(() {
      _isLoading = true;
    });
    
    // Отключаем VPN, если он подключен
    if (_vpnService.status == VpnStatus.connected) {
      await _vpnService.disconnect();
    }
    
    await _authService.logout();
    
    setState(() {
      _isLoading = false;
    });
    
    Navigator.of(context).pushReplacementNamed('/auth');
  }
  
  @override
  Widget build(BuildContext context) {
    final user = _authService.currentUser;
    
    return Scaffold(
      appBar: AppBar(
        title: Text('Настройки'),
      ),
      body: _isLoading
          ? _buildLoading()
          : _buildSettings(user != null),
    );
  }
  
  Widget _buildLoading() {
    return Center(
      child: CircularProgressIndicator(),
    );
  }
  
  Widget _buildSettings(bool isAuthenticated) {
    return ListView(
      padding: EdgeInsets.all(16),
      children: [
        if (isAuthenticated) ...[
          // Информация о пользователе
          Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Информация о пользователе',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 16),
                  _buildInfoRow(
                    'ID пользователя',
                    _authService.currentUser?.id ?? 'Неизвестно',
                  ),
                  _buildInfoRow(
                    'Статус активации',
                    _authService.isAuthenticated ? 'Активен' : 'Неактивен',
                  ),
                  _buildInfoRow(
                    'Дата активации',
                    _formatDate(_authService.currentUser?.activationDate),
                  ),
                  if (_authService.currentUser?.expirationDate != null)
                    _buildInfoRow(
                      'Действует до',
                      _formatDate(_authService.currentUser?.expirationDate),
                    ),
                ],
              ),
            ),
          ),
          
          SizedBox(height: 16),
        ],
        
        // Статус сервера
        Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Статус сервера',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.refresh),
                      onPressed: _checkServerAvailability,
                    ),
                  ],
                ),
                SizedBox(height: 16),
                Row(
                  children: [
                    Icon(
                      _serverAvailable ? Icons.check_circle : Icons.error,
                      color: _serverAvailable ? Colors.green : Colors.red,
                    ),
                    SizedBox(width: 8),
                    Text(
                      _serverAvailable ? 'Сервер доступен' : 'Сервер недоступен',
                      style: TextStyle(
                        color: _serverAvailable ? Colors.green : Colors.red,
                      ),
                    ),
                  ],
                ),
                if (_lastSyncTime != null) ...[
                  SizedBox(height: 8),
                  Text(
                    'Последняя проверка: ${_formatDateTime(_lastSyncTime!)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        
        SizedBox(height: 16),
        
        // Версия приложения
        Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'О приложении',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 16),
                _buildInfoRow('Версия', '1.0.0'),
                _buildInfoRow('Протокол', 'OpenVPN'),
              ],
            ),
          ),
        ),
        
        SizedBox(height: 32),
        
        if (isAuthenticated)
          SizedBox(
            height: 50,
            child: ElevatedButton(
              onPressed: _logout,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
              ),
              child: Text(
                'Выйти',
                style: TextStyle(fontSize: 16),
              ),
            ),
          ),
      ],
    );
  }
  
  Widget _buildInfoRow(String label, String? value) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.grey[700],
            ),
          ),
          Text(
            value ?? 'Н/Д',
            style: TextStyle(
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
  
  String _formatDate(DateTime? date) {
    if (date == null) return 'Н/Д';
    return '${date.day}.${date.month}.${date.year}';
  }
  
  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.day}.${dateTime.month}.${dateTime.year} ${dateTime.hour}:${dateTime.minute}';
  }
} 