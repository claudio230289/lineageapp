// js/dolar.js - Consulta de cotización del dólar (Argentina)

async function obtenerCotizacionDolar() {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/blue');
        if (!response.ok) throw new Error('No se pudo obtener la cotización');
        
        const data = await response.json();
        return {
            compra: data.compra,
            venta: data.venta,
            fechaActualizacion: data.fechaActualizacion
        };
    } catch (error) {
        console.warn("No se pudo conectar con la API del dólar, usando valores por defecto o caché.", error);
        return null;
    }
}

