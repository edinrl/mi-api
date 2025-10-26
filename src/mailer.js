import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Creamos el "transportador" que se encargará de enviar los correos
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Tu usuario de Gmail
    pass: process.env.EMAIL_PASS, // Tu contraseña de aplicación de Gmail
  },
});

transporter.verify().then(() => {
    console.log('Servicio de correo configurado y listo para enviar. 📧');
}).catch(console.error);