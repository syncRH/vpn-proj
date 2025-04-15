import 'package:flutter/material.dart';

class DarkTheme {
  static ThemeData get theme {
    return ThemeData(
      brightness: Brightness.dark,
      primaryColor: Color(0xFF1E88E5),
      accentColor: Color(0xFF64B5F6),
      scaffoldBackgroundColor: Color(0xFF121212),
      cardColor: Color(0xFF1E1E1E),
      dividerColor: Color(0xFF2C2C2C),
      textTheme: TextTheme(
        headline1: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
        headline2: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
        bodyText1: TextStyle(color: Colors.white, fontSize: 16),
        bodyText2: TextStyle(color: Colors.grey[300], fontSize: 14),
        button: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
      ),
      appBarTheme: AppBarTheme(
        color: Color(0xFF1E1E1E),
        elevation: 0,
        iconTheme: IconThemeData(color: Colors.white),
        titleTextStyle: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          primary: Color(0xFF1E88E5),
          onPrimary: Colors.white,
          padding: EdgeInsets.symmetric(vertical: 12, horizontal: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Color(0xFF2C2C2C),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Color(0xFF1E88E5), width: 2),
        ),
        labelStyle: TextStyle(color: Colors.grey[300]),
        hintStyle: TextStyle(color: Colors.grey[500]),
      ),
      cardTheme: CardTheme(
        color: Color(0xFF1E1E1E),
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }
} 