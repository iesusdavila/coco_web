// Configuración del socket
const socket = io();

// Variables globales
const jointNames = Array.from({ length: 12 }, (_, i) => `joint_${i + 1}`);
const sliders = {};
const configuraciones = [];

// Elementos DOM
const statusElement = document.getElementById('status');
const slidersDiv = document.getElementById('sliders');
const configListDiv = document.getElementById('configList');

// Crear sliders dinámicamente
function createSliders() {
    jointNames.forEach((joint, index) => {
        const container = document.createElement('div');
        container.className = 'joint';
        container.innerHTML = `
            <label>${joint.replace('_', ' ').toUpperCase()}</label>
            <div class="slider-container">
                <input type="range" 
                        class="slider" 
                        min="-3.14" 
                        max="3.14" 
                        step="0.01" 
                        value="0" 
                        id="${joint}">
                <div class="value-display" id="${joint}_val">0.00</div>
            </div>
        `;
        slidersDiv.appendChild(container);

        const slider = container.querySelector('input');
        const valueDisplay = container.querySelector('.value-display');
        
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            valueDisplay.textContent = value.toFixed(2);
            
            // Enviar actualización al servidor
            socket.emit('update_joint', {
                jointIndex: index,
                position: value
            });
        });

        sliders[joint] = slider;
    });
}

// Eventos de socket
socket.on('connect', () => {
    console.log('Conectado al servidor');
    statusElement.textContent = 'Conectado al servidor ROS2';
    statusElement.className = 'status connected';
});

socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
    statusElement.textContent = 'Desconectado del servidor';
    statusElement.className = 'status disconnected';
});

socket.on('joint_positions', (positions) => {
    console.log('Posiciones recibidas:', positions);
    positions.forEach((position, index) => {
        const joint = jointNames[index];
        if (sliders[joint]) {
            sliders[joint].value = position;
            document.getElementById(`${joint}_val`).textContent = position.toFixed(2);
        }
    });
});

socket.on('joint_updated', (data) => {
    const { jointIndex, position } = data;
    const joint = jointNames[jointIndex];
    if (sliders[joint]) {
        sliders[joint].value = position;
        document.getElementById(`${joint}_val`).textContent = position.toFixed(2);
    }
});

socket.on('configuration_saved', (data) => {
    console.log('Configuración guardada:', data.positions);
    configuraciones.push([...data.positions]);
    updateConfigList();
});

// Funciones de control
function guardarConfiguracion() {
    socket.emit('save_configuration');
}

function resetearJoints() {
    jointNames.forEach((joint, index) => {
        sliders[joint].value = 0;
        document.getElementById(`${joint}_val`).textContent = '0.00';
        socket.emit('update_joint', {
            jointIndex: index,
            position: 0
        });
    });
}

function exportarTxt() {
    if (configuraciones.length === 0) {
        alert('No hay configuraciones para exportar');
        return;
    }
    
    const contenido = configuraciones.map(config => 
        config.map(val => val.toFixed(3)).join(',')
    ).join('\n');
    
    const blob = new Blob([contenido], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'configuraciones_joints.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

function updateConfigList() {
    if (configuraciones.length === 0) {
        configListDiv.innerHTML = '<div class="config-item">No hay configuraciones guardadas</div>';
        return;
    }
    
    configListDiv.innerHTML = configuraciones.map((config, index) => 
        `<div class="config-item">
            Config ${index + 1}: [${config.map(val => val.toFixed(2)).join(', ')}]
        </div>`
    ).join('');
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    createSliders();
    console.log('Aplicación inicializada');
});