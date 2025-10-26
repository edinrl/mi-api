//Crear variables de entorno con dotenv
import { config } from 'dotenv';
config();

export default {
    // 1. Para el puerto de Render y tu local
    port: process.env.PORT || 9000, 

    }