#!/usr/bin/env node

/**
 * Script de prueba para verificar la creación de carpetas de almacenamiento
 * Ejecutar: node test-storage.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== TEST: Creación de Carpeta de Almacenamiento ===\n');

try {
    // Obtener home directory
    const homeDir = os.homedir();
    console.log(`[1] Home directory: ${homeDir}`);
    
    if (!homeDir) {
        throw new Error('No se pudo detectar el directorio home');
    }
    
    // Construir rutas
    const desktopPath = path.join(homeDir, 'Desktop');
    const storagePath = path.join(desktopPath, 'jsonControlm');
    
    console.log(`[2] Desktop path: ${desktopPath}`);
    console.log(`[3] Storage path: ${storagePath}`);
    
    // Verificar si Desktop existe
    console.log(`[4] Verificando Desktop...`);
    if (fs.existsSync(desktopPath)) {
        console.log(`   ✅ Desktop existe`);
        const stats = fs.statSync(desktopPath);
        console.log(`   Permisos: ${stats.mode.toString(8)}`);
    } else {
        console.log(`   ❌ Desktop NO existe, creando...`);
        try {
            fs.mkdirSync(desktopPath, { recursive: true, mode: 0o755 });
            console.log(`   ✅ Desktop creado`);
        } catch (error) {
            console.error(`   ❌ ERROR creando Desktop: ${error.message}`);
            throw error;
        }
    }
    
    // Verificar si jsonControlm existe
    console.log(`[5] Verificando jsonControlm...`);
    if (fs.existsSync(storagePath)) {
        console.log(`   ✅ jsonControlm existe`);
        const stats = fs.statSync(storagePath);
        console.log(`   Permisos: ${stats.mode.toString(8)}`);
    } else {
        console.log(`   ❌ jsonControlm NO existe, creando...`);
        try {
            fs.mkdirSync(storagePath, { recursive: true, mode: 0o755 });
            console.log(`   ✅ jsonControlm creado`);
        } catch (error) {
            console.error(`   ❌ ERROR creando jsonControlm: ${error.message}`);
            throw error;
        }
    }
    
    // Verificar permisos de escritura
    console.log(`[6] Verificando permisos de escritura...`);
    try {
        fs.accessSync(storagePath, fs.constants.W_OK);
        console.log(`   ✅ Permisos de escritura OK`);
    } catch (error) {
        console.error(`   ❌ Sin permisos de escritura: ${error.message}`);
        throw error;
    }
    
    // Intentar escribir un archivo de prueba
    console.log(`[7] Probando escritura de archivo...`);
    const testFile = path.join(storagePath, 'test-write.txt');
    try {
        fs.writeFileSync(testFile, 'test content');
        console.log(`   ✅ Archivo escrito exitosamente`);
        
        // Leer el archivo
        const content = fs.readFileSync(testFile, 'utf8');
        console.log(`   ✅ Archivo leído: "${content}"`);
        
        // Eliminar el archivo
        fs.unlinkSync(testFile);
        console.log(`   ✅ Archivo eliminado`);
    } catch (error) {
        console.error(`   ❌ ERROR escribiendo archivo: ${error.message}`);
        throw error;
    }
    
    console.log(`\n✅ TEST EXITOSO: Todo funciona correctamente`);
    console.log(`📁 Ruta final: ${storagePath}`);
    
} catch (error) {
    console.error(`\n❌ TEST FALLIDO`);
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code || 'N/A'}`);
    console.error(`Stack: ${error.stack}`);
    process.exit(1);
}
