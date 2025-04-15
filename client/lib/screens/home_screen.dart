import 'dart:async';
import 'package:flutter/material.dart';
import '../services/vpn_service.dart';
import '../services/api_service.dart';
import '../models/server_model.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _vpnService = VpnService();
  final _apiService = ApiService();
  
  List<VpnServer> _servers = [];
  VpnServer? _selectedServer;
  VpnMode _selectedMode = VpnMode.antizapret;
  bool _isLoading = true;
  String? _errorMessage;
  
  late StreamSubscription<VpnStatus> _statusSubscription;
  
  @override
  void initState() {
    super.initState();
    _setupVpnService();
    _loadServers();
    _startPingTimer();
  }
  
  Future<void> _setupVpnService() async {
    await _vpnService.initialize();
    _statusSubscription = _vpnService.statusStream.listen((status) {
      setState(() {});
    });
  }
  
  Future<void> _loadServers() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    try {
      final servers = await _apiService.getServers();
      
      if (servers.isEmpty) {
        setState(() {
          _errorMessage = 'Не удалось загрузить список серверов';
          _isLoading = false;
        });
        return;
      }
      
      // Измерение пинга для всех серверов
      for (final server in servers) {
        final ping = await _vpnService.measurePing(server.ipAddress);
        final index = servers.indexOf(server);
        servers[index] = server.copyWith(ping: ping);
      }
      
      // Сортировка по пингу
      servers.sort((a, b) => a.ping.compareTo(b.ping));
      
      setState(() {
        _servers = servers;
        _selectedServer = servers.first;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Ошибка при загрузке серверов';
        _isLoading = false;
      });
    }
  }
  
  void _startPingTimer() {
    Timer.periodic(Duration(seconds: 30), (timer) async {
      if (_servers.isNotEmpty) {
        final updatedServers = List<VpnServer>.from(_servers);
        
        for (int i = 0; i < updatedServers.length; i++) {
          final server = updatedServers[i];
          final ping = await _vpnService.measurePing(server.ipAddress);
          updatedServers[i] = server.copyWith(ping: ping);
        }
        
        updatedServers.sort((a, b) => a.ping.compareTo(b.ping));
        
        setState(() {
          _servers = updatedServers;
          
          // Если сервер с наименьшим пингом отличается от текущего и VPN не подключен,
          // предлагаем сменить сервер
          if (_selectedServer != null && 
              _selectedServer!.id != updatedServers.first.id &&
              _vpnService.status == VpnStatus.disconnected) {
            _selectedServer = updatedServers.first;
          }
        });
      }
    });
  }
  
  Future<void> _toggleVpnConnection() async {
    if (_selectedServer == null) return;
    
    final currentStatus = _vpnService.status;
    
    try {
      if (currentStatus == VpnStatus.disconnected) {
        await _vpnService.connect(_selectedServer!, _selectedMode);
      } else if (currentStatus == VpnStatus.connected) {
        await _vpnService.disconnect();
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
      });
      
      // Если ошибка связана с авторизацией, перенаправляем на экран авторизации
      if (e.toString().contains('авторизация')) {
        Navigator.of(context).pushReplacementNamed('/auth');
      }
    }
  }
  
  void _selectServer(VpnServer server) {
    setState(() {
      _selectedServer = server;
    });
  }
  
  void _selectMode(VpnMode mode) {
    setState(() {
      _selectedMode = mode;
    });
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('VPN Клиент'),
        actions: [
          IconButton(
            icon: Icon(Icons.settings),
            onPressed: () => Navigator.of(context).pushNamed('/settings'),
          ),
        ],
      ),
      body: _isLoading
          ? _buildLoading()
          : _errorMessage != null
              ? _buildError()
              : _buildContent(),
    );
  }
  
  Widget _buildLoading() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Загрузка серверов...'),
        ],
      ),
    );
  }
  
  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: Colors.red,
          ),
          SizedBox(height: 16),
          Text(_errorMessage!),
          SizedBox(height: 24),
          ElevatedButton(
            onPressed: _loadServers,
            child: Text('Повторить'),
          ),
        ],
      ),
    );
  }
  
  Widget _buildContent() {
    final currentStatus = _vpnService.status;
    final isConnected = currentStatus == VpnStatus.connected;
    final isConnecting = currentStatus == VpnStatus.connecting;
    final isDisconnecting = currentStatus == VpnStatus.disconnecting;
    final isProcessing = isConnecting || isDisconnecting;
    
    return Padding(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Режим работы
          Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Режим работы',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _buildModeButton(
                          mode: VpnMode.antizapret,
                          title: 'Анти-запрет',
                          description: 'Разблокировка сайтов',
                        ),
                      ),
                      SizedBox(width: 8),
                      Expanded(
                        child: _buildModeButton(
                          mode: VpnMode.fullVpn,
                          title: 'Полный VPN',
                          description: 'Шифрование всего трафика',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          
          SizedBox(height: 16),
          
          // Список серверов
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
                        'Серверы',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: Icon(Icons.refresh),
                        onPressed: _loadServers,
                      ),
                    ],
                  ),
                  SizedBox(height: 8),
                  ..._servers.map((server) => _buildServerItem(server)),
                ],
              ),
            ),
          ),
          
          Spacer(),
          
          // Кнопка подключения/отключения
          SizedBox(
            height: 60,
            child: ElevatedButton(
              onPressed: isProcessing ? null : _toggleVpnConnection,
              style: ElevatedButton.styleFrom(
                backgroundColor: isConnected ? Colors.red : Colors.green,
              ),
              child: isProcessing
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(width: 12),
                        Text(
                          isConnecting ? 'Подключение...' : 'Отключение...',
                          style: TextStyle(fontSize: 18),
                        ),
                      ],
                    )
                  : Text(
                      isConnected ? 'Отключиться' : 'Подключиться',
                      style: TextStyle(fontSize: 18),
                    ),
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildModeButton({
    required VpnMode mode,
    required String title,
    required String description,
  }) {
    final isSelected = _selectedMode == mode;
    
    return GestureDetector(
      onTap: () => _selectMode(mode),
      child: Container(
        padding: EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? Theme.of(context).primaryColor : Colors.grey,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  color: isSelected ? Theme.of(context).primaryColor : Colors.grey,
                ),
                SizedBox(width: 8),
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            SizedBox(height: 4),
            Text(
              description,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildServerItem(VpnServer server) {
    final isSelected = _selectedServer?.id == server.id;
    
    return InkWell(
      onTap: () => _selectServer(server),
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: Colors.grey.withOpacity(0.3),
              width: 1,
            ),
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.check_circle : Icons.circle_outlined,
              color: isSelected ? Theme.of(context).primaryColor : Colors.grey,
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    server.ipAddress,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    server.isActive ? 'Активен' : 'Неактивен',
                    style: TextStyle(
                      fontSize: 12,
                      color: server.isActive ? Colors.green : Colors.red,
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${server.ping} мс',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: _getPingColor(server.ping),
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  _getPingQuality(server.ping),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Color _getPingColor(int ping) {
    if (ping < 100) return Colors.green;
    if (ping < 200) return Colors.orange;
    return Colors.red;
  }
  
  String _getPingQuality(int ping) {
    if (ping < 100) return 'Отличный';
    if (ping < 200) return 'Хороший';
    if (ping < 300) return 'Средний';
    return 'Плохой';
  }
  
  @override
  void dispose() {
    _statusSubscription.cancel();
    _vpnService.dispose();
    super.dispose();
  }
} 