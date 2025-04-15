class VpnServer {
  final String id;
  final String ipAddress;
  final bool isActive;
  final String antizapretConfig;
  final String fullVpnConfig;
  final int ping;

  VpnServer({
    required this.id,
    required this.ipAddress,
    required this.isActive,
    required this.antizapretConfig,
    required this.fullVpnConfig,
    this.ping = 0,
  });

  factory VpnServer.fromJson(Map<String, dynamic> json) {
    return VpnServer(
      id: json['id'],
      ipAddress: json['ipAddress'],
      isActive: json['isActive'],
      antizapretConfig: json['antizapretConfig'],
      fullVpnConfig: json['fullVpnConfig'],
      ping: json['ping'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'ipAddress': ipAddress,
      'isActive': isActive,
      'antizapretConfig': antizapretConfig,
      'fullVpnConfig': fullVpnConfig,
      'ping': ping,
    };
  }

  VpnServer copyWith({
    String? id,
    String? ipAddress,
    bool? isActive,
    String? antizapretConfig,
    String? fullVpnConfig,
    int? ping,
  }) {
    return VpnServer(
      id: id ?? this.id,
      ipAddress: ipAddress ?? this.ipAddress,
      isActive: isActive ?? this.isActive,
      antizapretConfig: antizapretConfig ?? this.antizapretConfig,
      fullVpnConfig: fullVpnConfig ?? this.fullVpnConfig,
      ping: ping ?? this.ping,
    );
  }
} 