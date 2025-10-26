// src/services/userService.js
import express from 'express';
import { pool } from '../database/conexion.js'; // <- Aquí va la importación

export const getUsers = async () => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    return rows;
  } catch (error) {
    console.error('Error consultando users:', error);
    throw error;
  }
};
