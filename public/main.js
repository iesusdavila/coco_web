// Configuración del socket
const socket = io();

// Variables globales
const jointNames = Array.from({ length: 12 }, (_, i) => `joint_${i + 1}`);
const sliders = {};
const configuraciones = [];
const jointsLimits = {
    joint_1: [-0.78, 0.78],
    joint_2: [-0.3, 0.3],
    joint_3: [-0.52, 0.52],
    joint_4: [-0.26, 0.78],
    joint_5: [-0.75, 1.50],
    joint_6: [0.05, 0.98],
    joint_7: [-0.69, 0.69],
    joint_8: [0.15, 1.50],
    joint_9: [-0.75, 1.50],
    joint_10: [0.05, 0.98],
    joint_11: [-0.69, 0.69],
    joint_12: [0.15, 1.50]
};

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
                        min="${jointsLimits[joint][0]}"
                        max="${jointsLimits[joint][1]}"
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
    statusElement.textContent = 'Connected';
    statusElement.className = 'status connected';
});

socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
    statusElement.textContent = 'Disconnected';
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

function moveItem(index, direction) {
    if (index < 0 || index >= configuraciones.length) {
        console.error('Índice fuera de rango:', index);
        return;
    }
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= configuraciones.length) {
        console.error('Movimiento fuera de rango:', newIndex);
        return;
    }
    const item = configuraciones.splice(index, 1)[0];
    configuraciones.splice(newIndex, 0, item);
    updateConfigList();
}

function deleteAllItems() {
    if (configuraciones.length === 0) {
        alert('No hay configuraciones para eliminar');
        return;
    }
    if (confirm('Are you sure you want to delete all poses?')) {
        configuraciones.length = 0; 
        updateConfigList();
    }
}

function deleteItem(index) {
    if (index < 0 || index >= configuraciones.length) {
        console.error('Índice fuera de rango:', index);
        return;
    }
    
    configuraciones.splice(index, 1);
    updateConfigList();
}

function updateConfigList() {
    if (configuraciones.length === 0) {
        configListDiv.innerHTML = '<div class="config-item">There are no saved poses.</div>';
        return;
    }
    
    configListDiv.innerHTML = configuraciones.map((config, index) => 
        `<div class="config-item-container">
            <div class="config-item">
                Pose ${index + 1}: [${config.map(val => val.toFixed(2)).join(', ')}]
            </div>
            <img class="move" src="assets/icons/arrow-up.png" alt="Move Up" onclick="moveItem(${index}, -1)"/>
            <img class="move" src="assets/icons/arrow-down.png" alt="Move Down" onclick="moveItem(${index}, 1)"/>
            <img class="delete" src="assets/icons/trash.png" alt="Move Down" onclick="deleteItem(${index})"/>
        </div>`
    ).join('');
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    createSliders();
    console.log('Aplicación inicializada');
});