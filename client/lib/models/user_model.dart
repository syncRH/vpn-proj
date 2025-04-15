class User {
  final String id;
  final String activationKey;
  final bool isActive;
  final DateTime activationDate;
  final DateTime? expirationDate;

  User({
    required this.id,
    required this.activationKey,
    required this.isActive,
    required this.activationDate,
    this.expirationDate,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      activationKey: json['activationKey'],
      isActive: json['isActive'],
      activationDate: DateTime.parse(json['activationDate']),
      expirationDate: json['expirationDate'] != null
          ? DateTime.parse(json['expirationDate'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'activationKey': activationKey,
      'isActive': isActive,
      'activationDate': activationDate.toIso8601String(),
      'expirationDate': expirationDate?.toIso8601String(),
    };
  }

  bool get isExpired {
    if (expirationDate == null) return false;
    return DateTime.now().isAfter(expirationDate!);
  }
} 