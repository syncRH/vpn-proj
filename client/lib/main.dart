import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/auth_screen.dart';
import 'services/vpn_service.dart';
import 'services/auth_service.dart';
import 'theme/dark_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  
  runApp(VpnApp());
}

class VpnApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VPN Клиент',
      theme: DarkTheme.theme,
      initialRoute: '/auth',
      routes: {
        '/auth': (context) => AuthScreen(),
        '/home': (context) => HomeScreen(),
        '/settings': (context) => SettingsScreen(),
      },
    );
  }
} 