#!/usr/bin/env node

/**
 * Script de prueba directo para verificar que el guardado funciona
 * Ejecutar: node test-save-direct.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== TEST DIRECTO DE GUARDADO ===\n');

try {
    // 1. Obtener rutas
    const homeDir = os.homedir();
    console.log('1. Home directory:', homeDir);
    
    const desktopPath = path.join(homeDir, 'Desktop');
    const storagePath = path.join(desktopPath, 'jsonControlm');
    const fileName = 'test-direct.json';
    const filePath = path.join(storagePath, fileName);
    
    console.log('2. Desktop path:', desktopPath);
    console.log('3. Storage path:', storagePath);
    console.log('4. File path:', filePath);
    
    // 2. Crear carpetas
    console.log('\n5. Creando carpetas...');
    try {
        fs.mkdirSync(desktopPath, { recursive: true });
        console.log('   ✅ Desktop creado');
    } catch (e) {
        console.log('   ℹ️ Desktop ya existe');
    }
    
    try {
        fs.mkdirSync(storagePath, { recursive: true });
        console.log('   ✅ jsonControlm creado');
    } catch (e) {
        console.log('   ℹ️ jsonControlm ya existe');
    }
    
    // 3. Preparar datos de prueba
    const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Archivo de prueba creado directamente',
        data: { ejemplo: 'datos' }
    };
    const jsonString = JSON.stringify(testData, null, 2);
    console.log('\n6. JSON preparado, longitud:', jsonString.length);
    
    // 4. ESCRIBIR ARCHIVO
    console.log('\n7. Escribiendo archivo...');
    fs.writeFileSync(filePath, jsonString, 'utf8');
    console.log('   ✅ Archivo escrito');
    
    // 5. VERIFICAR
    console.log('\n8. Verificando archivo...');
    if (!fs.existsSync(filePath)) {
        throw new Error('El archivo no existe después de escribirlo');
    }
    
    const stats = fs.statSync(filePath);
    console.log('   ✅ Archivo existe');
    console.log('   ✅ Tamaño:', stats.size, 'bytes');
    
    // 6. LEER ARCHIVO
    console.log('\n9. Leyendo archivo...');
    const readContent = fs.readFileSync(filePath, 'utf8');
    console.log('   ✅ Archivo leído, longitud:', readContent.length);
    
    // 7. VERIFICAR CONTENIDO
    const parsed = JSON.parse(readContent);
    console.log('   ✅ JSON válido');
    console.log('   ✅ Contenido:', parsed.message);
    
    console.log('\n=== ✅ TEST EXITOSO ===');
    console.log('Archivo guardado en:', filePath);
    console.log('\nEjecuta: ls -la', filePath);
    console.log('Ejecuta: cat', filePath);
    
} catch (error) {
    console.error('\n=== ❌ TEST FALLIDO ===');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Stack:', error.stack);
    process.exit(1);
}
