import express from 'express';

import cors from 'cors'; // Importa cors para permitir solicitudes de diferentes orígenes

import config from './config.js';
import UgelTalara from './routes/UgelTalara.routes.js';

const app = express();

// Configuración del puerto
app.set('port', config.port);

// Configurar middlewares para el análisis del cuerpo de la solicitud
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors()); // Agrega cors para manejar las políticas de origen cruzado

// Monta tus rutas bajo el prefijo '/api'
app.use('/api', UgelTalara);

export default app;