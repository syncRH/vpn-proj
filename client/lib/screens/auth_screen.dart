import 'package:flutter/material.dart';
import '../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  @override
  _AuthScreenState createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _activationKeyController = TextEditingController();
  final _authService = AuthService();
  
  bool _isLoading = false;
  String? _errorMessage;
  
  @override
  void initState() {
    super.initState();
    _checkExistingAuth();
  }
  
  Future<void> _checkExistingAuth() async {
    setState(() {
      _isLoading = true;
    });
    
    final isAuthenticated = await _authService.loadStoredCredentials();
    
    if (isAuthenticated) {
      _navigateToHome();
    }
    
    setState(() {
      _isLoading = false;
    });
  }
  
  Future<void> _activateWithKey() async {
    if (!_formKey.currentState!.validate()) return;
    
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    final activationKey = _activationKeyController.text.trim();
    final success = await _authService.activateWithKey(activationKey);
    
    if (success) {
      _navigateToHome();
    } else {
      setState(() {
        _errorMessage = 'Неверный ключ активации или произошла ошибка';
        _isLoading = false;
      });
    }
  }
  
  void _navigateToHome() {
    Navigator.of(context).pushReplacementNamed('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(24),
            child: _isLoading
                ? _buildLoading()
                : _buildAuthForm(),
          ),
        ),
      ),
    );
  }
  
  Widget _buildLoading() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircularProgressIndicator(),
        SizedBox(height: 16),
        Text('Загрузка...'),
      ],
    );
  }
  
  Widget _buildAuthForm() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
          'assets/logo.png',
          height: 120,
          width: 120,
        ),
        SizedBox(height: 32),
        Text(
          'VPN Клиент',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'Введите ключ активации',
          style: TextStyle(
            fontSize: 16,
            color: Colors.grey,
          ),
        ),
        SizedBox(height: 32),
        Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _activationKeyController,
                decoration: InputDecoration(
                  labelText: 'Ключ активации',
                  prefixIcon: Icon(Icons.vpn_key),
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Пожалуйста, введите ключ активации';
                  }
                  return null;
                },
              ),
              if (_errorMessage != null) ...[
                SizedBox(height: 16),
                Text(
                  _errorMessage!,
                  style: TextStyle(
                    color: Colors.red,
                  ),
                ),
              ],
              SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _activateWithKey,
                  child: Text(
                    'Активировать',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
  
  @override
  void dispose() {
    _activationKeyController.dispose();
    super.dispose();
  }
} 