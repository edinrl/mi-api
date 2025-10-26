# 📱 API de Verificación de Certificados por QR

Esta API permite escanear códigos QR de certificados desde aplicaciones móviles y verificar los datos del certificado.

## 🔗 Endpoints Disponibles

### 1. Verificar por Código (GET)
**URL:** `GET http://localhost:9000/ugel-talara/documentos/verificar-certificado/:codigoCertificado`

**Descripción:** Verifica un certificado usando el código del QR

**Ejemplo de uso:**
```javascript
// El código del certificado viene en el QR
const codigo = "CERT-12345678";

fetch(`http://localhost:9000/ugel-talara/documentos/verificar-certificado/${codigo}`)
  .then(res => res.json())
  .then(data => {
    console.log("Certificado verificado:", data);
  });
```

**Respuesta Exitosa:**
```json
{
  "valido": true,
  "certificado": {
    "codigo": "CERT-12345678",
    "fechaGeneracion": "2025-01-15T10:30:00.000Z",
    "nombreArchivo": "Certificado_Juan_Perez.pdf"
  },
  "postulante": {
    "id": 1,
    "nombreCompleto": "Juan Pérez",
    "correo": "juan@example.com"
  },
  "convocatoria": {
    "puesto": "Docente de Matemáticas",
    "numeroCas": "123456",
    "area": "Educación"
  },
  "archivos": {
    "curriculum": [
      {
        "nombre": "curriculum.pdf",
        "tamaño": 245760,
        "tipo": "application/pdf",
        "fecha": "2025-01-15T08:00:00.000Z"
      }
    ],
    "anexos": [
      {
        "nombre": "anexo.pdf",
        "tamaño": 98765,
        "tipo": "application/pdf",
        "fecha": "2025-01-15T09:00:00.000Z"
      }
    ]
  },
  "fechaVerificacion": "2025-01-15T12:00:00.000Z",
  "mensaje": "Certificado verificado exitosamente"
}
```

---

### 2. Verificar por Datos del QR (POST)
**URL:** `POST http://localhost:9000/ugel-talara/documentos/verificar-certificado`

**Descripción:** Envía los datos completos escaneados del QR

**Ejemplo de uso:**
```javascript
// Datos completos del QR
const qrData = {
  certificado: "CERT-12345678",
  postulante: "Juan Pérez",
  email: "juan@example.com",
  puesto: "Docente de Matemáticas",
  archivosCurriculum: {
    cantidad: 1,
    archivos: [...]
  },
  archivosAnexos: {
    cantidad: 1,
    archivos: [...]
  }
};

fetch('http://localhost:9000/ugel-talara/documentos/verificar-certificado', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(qrData)
})
  .then(res => res.json())
  .then(data => {
    console.log("Certificado verificado:", data);
  });
```

**Respuesta Exitosa:**
```json
{
  "valido": true,
  "datosQR": {
    "certificado": "CERT-12345678",
    "postulante": "Juan Pérez",
    ...
  },
  "fechaVerificacion": "2025-01-15T12:00:00.000Z",
  "mensaje": "Certificado verificado desde código QR"
}
```

---

### 3. Obtener Verificaciones Registradas (GET) - Para Comité
**URL:** `GET http://localhost:9000/ugel-talara/documentos/verificaciones-sesion-comite`

**Descripción:** Obtiene todas las verificaciones registradas para la sesión de comité (requiere autenticación)

**Headers:**
```
Authorization: Bearer <token>
```

**Parámetros de consulta:**
- `fechaInicio` (opcional): Fecha de inicio del rango
- `fechaFin` (opcional): Fecha fin del rango
- `limit` (opcional): Límite de resultados (default: 100)

**Ejemplo de uso:**
```javascript
const token = "tu_token_de_autenticacion";

fetch('http://localhost:9000/ugel-talara/documentos/verificaciones-sesion-comite?limit=50', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
  .then(res => res.json())
  .then(data => {
    console.log("Verificaciones:", data);
  });
```

**Respuesta Exitosa:**
```json
{
  "total": 5,
  "verificaciones": [
    {
      "id": 1,
      "codigoCertificado": "CERT-12345678",
      "datosQR": { ... },
      "datosVerificados": {
        "certificado": { ... },
        "postulante": { ... },
        "convocatoria": { ... },
        "archivos": { ... }
      },
      "fechaVerificacion": "2025-01-15T12:00:00.000Z",
      "ipVerificacion": "192.168.1.100"
    }
  ],
  "fechaConsulta": "2025-01-15T12:30:00.000Z"
}
```

---

## 📱 Ejemplo de Implementación en App Móvil

### React Native (JavaScript)

```javascript
import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import QRCodeScanner from 'react-native-qrcode-scanner';

const VerificacionQR = () => {
  const [datosVerificacion, setDatosVerificacion] = useState(null);
  const [error, setError] = useState(null);

  const onSuccess = async (e) => {
    try {
      // Opción 1: Si el QR contiene una URL
      if (e.data.startsWith('http')) {
        const response = await fetch(e.data);
        const data = await response.json();
        setDatosVerificacion(data);
      }
      // Opción 2: Si el QR contiene JSON - ESTO REGISTRA AUTOMÁTICAMENTE EN SESIÓN DE COMITÉ
      else {
        const qrData = JSON.parse(e.data);
        const response = await fetch(
          'http://localhost:9000/ugel-talara/documentos/verificar-certificado',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(qrData)
          }
        );
        const data = await response.json();
        setDatosVerificacion(data);
        
        // ✅ Los datos ya están registrados en la sesión de comité automáticamente
        // data.sesionComite.registrado será true
        console.log('✅ Registrado en sesión de comité:', data.sesionComite);
      }
    } catch (err) {
      setError('Error al verificar el certificado');
      console.error(err);
    }
  };

  return (
    <View style={styles.container}>
      <QRCodeScanner
        onRead={onSuccess}
        showMarker={true}
        markerStyle={styles.marker}
      />
      {datosVerificacion && (
        <View style={styles.result}>
          <Text style={styles.success}>
            ✅ Certificado Válido
          </Text>
          <Text>Postulante: {datosVerificacion.postulante?.nombreCompleto}</Text>
          <Text>Puesto: {datosVerificacion.convocatoria?.puesto}</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  marker: {
    borderColor: '#fff',
    backgroundColor: 'transparent'
  },
  result: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10
  },
  success: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'green'
  },
  error: {
    color: 'red'
  }
});

export default VerificacionQR;
```

---

### Flutter (Dart)

```dart
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class VerificacionQR extends StatefulWidget {
  @override
  _VerificacionQRState createState() => _VerificacionQRState();
}

class _VerificacionQRState extends State<VerificacionQR> {
  final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');
  QRViewController? controller;
  Map<String, dynamic>? datosVerificacion;

  void _onQRViewCreated(QRViewController controller) {
    this.controller = controller;
    controller.scannedDataStream.listen((scanData) async {
      try {
        // Decodificar datos del QR
        final qrData = json.decode(scanData.code);
        
        // Verificar con la API
        final response = await http.post(
          Uri.parse('http://localhost:9000/ugel-talara/documentos/verificar-certificado'),
          headers: {'Content-Type': 'application/json'},
          body: json.encode(qrData),
        );
        
        if (response.statusCode == 200) {
          setState(() {
            datosVerificacion = json.decode(response.body);
          });
        }
      } catch (e) {
        print('Error: $e');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Verificar Certificado')),
      body: Column(
        children: [
          Expanded(
            flex: 5,
            child: QRView(
              key: qrKey,
              onQRViewCreated: _onQRViewCreated,
            ),
          ),
          if (datosVerificacion != null)
            Expanded(
              flex: 2,
              child: Card(
                child: Column(
                  children: [
                    Text('✅ Certificado Válido', 
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    Text('Postulante: ${datosVerificacion!['postulante']?['nombreCompleto']}'),
                    Text('Puesto: ${datosVerificacion!['convocatoria']?['puesto']}'),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
```

---

## 🔒 Seguridad

- Las rutas de verificación **NO requieren token** para facilitar el escaneo desde apps móviles
- Se recomienda agregar rate limiting en producción
- Considerar CORS para apps web

---

## 🧪 Testing

### Con cURL:

```bash
# Verificar por código
curl http://localhost:9000/ugel-talara/documentos/verificar-certificado/CERT-12345678

# Verificar por datos
curl -X POST http://localhost:9000/ugel-talara/documentos/verificar-certificado \
  -H "Content-Type: application/json" \
  -d '{
    "certificado": "CERT-12345678",
    "postulante": "Juan Pérez",
    "email": "juan@example.com"
  }'
```

---

## 📝 Notas

- El código del certificado se genera automáticamente al crear el certificado
- Los archivos adjuntos (curriculum y anexos) se incluyen en la respuesta
- La fecha de verificación se registra automáticamente

---

## 🎯 Flujo Completo de Verificación

### 1. Usuario Escanea QR con App Móvil
```javascript
// Al escanear, se envía el JSON del QR a la API
const response = await fetch('http://localhost:9000/ugel-talara/documentos/verificar-certificado', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(qrData)
});

const resultado = await response.json();
// resultado.sesionComite.registrado será true ✅
```

### 2. Sistema Registra Automáticamente
- Los datos se guardan en la tabla `VerificacionesQR`
- Incluye todos los datos del postulante
- Incluye información de archivos subidos
- Se registra IP y timestamp

### 3. Comité Consulta Verificaciones
```javascript
// Desde la sesión de comité (requiere autenticación)
const token = "token_del_comite";
const response = await fetch(
  'http://localhost:9000/ugel-talara/documentos/verificaciones-sesion-comite',
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
);

const verificaciones = await response.json();
console.log(`Total de verificaciones: ${verificaciones.total}`);
verificaciones.verificaciones.forEach(v => {
  console.log(`- ${v.datosVerificados.postulante.nombreCompleto}`);
});
```

### 4. Resultado
- ✅ Todos los datos del QR aparecen en la app
- ✅ Se registra automáticamente en sesión de comité
- ✅ El comité puede consultar todas las verificaciones
- ✅ Incluye curriculum y anexos subidos
