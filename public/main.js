// Configuración del socket
const socket = io();

// Variables globales
const jointNames = Array.from({ length: 12 }, (_, i) => `joint_${i + 1}`);
const sliders = {};
const poses = [];
let isRobotMoving = false;

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
            
            // Solo actualizar el valor local, no mover el robot automáticamente
            socket.emit('update_joint', {
                jointIndex: index,
                position: value
            });
        });

        sliders[joint] = slider;
    });
}

// Función para obtener posiciones actuales de los sliders
function getCurrentSliderPositions() {
    return jointNames.map(joint => parseFloat(sliders[joint].value));
}

// Función para mover el robot a las posiciones actuales
function moveRobotToCurrent() {
    if (isRobotMoving) {
        alert('El robot ya se está moviendo. Espera a que termine o detén el movimiento.');
        return;
    }
    
    const positions = getCurrentSliderPositions();
    const duration = 2.0; // Tiempo fijo de 2 segundos para movimientos individuales
    
    socket.emit('move_to_position', { positions, duration });
}

// Función para detener el movimiento del robot
function stopRobot() {
    socket.emit('stop_movement');
}

// Función para ejecutar todas las poses guardadas como trayectoria
function executeAllPoses() {
    if (poses.length === 0) {
        alert('No hay poses guardadas para ejecutar.');
        return;
    }
    
    if (isRobotMoving) {
        alert('El robot ya se está moviendo. Espera a que termine o detén el movimiento.');
        return;
    }
    
    if (confirm(`¿Ejecutar secuencia de ${poses.length} poses?`)) {
        socket.emit('execute_trajectory', { trajectoryPoints: poses });
    }
}

// Eventos de socket
socket.on('connect', () => {
    console.log('Connected to server');
    statusElement.textContent = 'Connected';
    statusElement.className = 'status connected';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    statusElement.textContent = 'Disconnected';
    statusElement.className = 'status disconnected';
    isRobotMoving = false;
    updateMovementUI();
});

socket.on('robot_status', (data) => {
    isRobotMoving = data.isMoving;
    updateMovementUI();
});

socket.on('joint_positions', (positions) => {
    positions.forEach((position, index) => {
        const joint = jointNames[index];
        if (sliders[joint]) {
            sliders[joint].value = position;
            document.getElementById(`${joint}_val`).textContent = position.toFixed(2);
        }
    });
});

socket.on('joint_positions_update', (positions) => {
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

socket.on('movement_completed', (data) => {
    isRobotMoving = false;
    updateMovementUI();
    
    if (data.success) {
        console.log('Movimiento completado exitosamente');
        // Actualizar sliders con la posición final
        data.positions.forEach((position, index) => {
            const joint = jointNames[index];
            if (sliders[joint]) {
                sliders[joint].value = position;
                document.getElementById(`${joint}_val`).textContent = position.toFixed(2);
            }
        });
    } else {
        alert('El movimiento falló. Revisa la consola para más detalles.');
    }
});

socket.on('trajectory_completed', (data) => {
    isRobotMoving = false;
    updateMovementUI();
    
    if (data.success) {
        console.log('Trayectoria completada exitosamente');
        alert('¡Secuencia de poses ejecutada exitosamente!');
    } else {
        alert('La ejecución de la trayectoria falló. Revisa la consola para más detalles.');
    }
});

socket.on('movement_error', (data) => {
    isRobotMoving = false;
    updateMovementUI();
    alert(`Error en el movimiento: ${data.error}`);
    console.error('Movement error:', data.error);
});

socket.on('trajectory_error', (data) => {
    isRobotMoving = false;
    updateMovementUI();
    alert(`Error en la trayectoria: ${data.error}`);
    console.error('Trajectory error:', data.error);
});

socket.on('movement_stopped', () => {
    isRobotMoving = false;
    updateMovementUI();
    console.log('Movimiento detenido');
});

socket.on('configuration_saved', (data) => {
    poses.push([...data.positions, parseFloat(document.getElementById('timerInput').value)]);
    updateConfigList();
});

// Función para actualizar la UI según el estado del movimiento
function updateMovementUI() {
    const moveButton = document.getElementById('moveButton');
    const stopButton = document.getElementById('stopButton');
    const executeButton = document.getElementById('executeButton');
    
    if (moveButton) {
        moveButton.disabled = isRobotMoving;
        moveButton.textContent = isRobotMoving ? 'Moving...' : 'Move Robot';
    }
    
    if (stopButton) {
        stopButton.disabled = !isRobotMoving;
    }
    
    if (executeButton) {
        executeButton.disabled = isRobotMoving || poses.length === 0;
    }
    
    // Actualizar status
    if (isRobotMoving) {
        statusElement.textContent = 'Moving...';
        statusElement.className = 'status moving';
    } else if (statusElement.className.includes('connected')) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'status connected';
    }
}

// Funciones de control
function importPoses() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    poses.length = 0; 
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const lines = content.split('\n').filter(line => line.trim() !== '');
            poses.push(...lines.map(line =>
                line.split(',').map(val => parseFloat(val.trim()))
            ));
            updateConfigList();
        };
        reader.readAsText(file);
    };
    input.click();
}

function savePose() {
    if (!document.getElementById('timerInput').value) {
        alert('Please enter a timer value before saving the pose.');
        return;
    }
    const timerValue = parseFloat(document.getElementById('timerInput').value);
    if (isNaN(timerValue) || timerValue <= 0 || timerValue > 60) {
        alert('Please enter a valid timer value greater than 0 and less than or equal to 60 seconds.');
        return;
    }
    socket.emit('save_configuration');
}

function reseatJoints() {
    jointNames.forEach((joint, index) => {
        sliders[joint].value = 0;
        document.getElementById(`${joint}_val`).textContent = '0.00';
        socket.emit('update_joint', {
            jointIndex: index,
            position: 0
        });
    });
}

function exportPoses() {
    if (poses.length === 0) {
        alert('No hay poses para exportar');
        return;
    }
    
    const contenido = poses.map(config => 
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
    if (index < 0 || index >= poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= poses.length) {
        console.error('Move out of bounds:', newIndex);
        return;
    }
    const item = poses.splice(index, 1)[0];
    poses.splice(newIndex, 0, item);
    updateConfigList();
}

function deleteAllItems() {
    if (poses.length === 0) {
        alert('No hay poses para eliminar');
        return;
    }
    if (confirm('Are you sure you want to delete all poses?')) {
        poses.length = 0; 
        updateConfigList();
    }
}

function deleteItem(index) {
    if (index < 0 || index >= poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    
    poses.splice(index, 1);
    updateConfigList();
}

function updateConfigList() {
    if (poses.length === 0) {
        configListDiv.innerHTML = '<div class="config-item">There are no saved poses.</div>';
        updateMovementUI();
        return;
    }
    
    configListDiv.innerHTML = poses.map((config, index) => 
        `<div class="config-item-container">
            <div class="index-item">
                <span class="index">${index + 1}</span>
            </div>
            <div class="config-item">
                ${config.slice(0, -1).map((val, i) => `<span class="joint-value">${jointNames[i].replace('_', ' ')}: ${val.toFixed(2)}</span>`).join(', ')}
            </div>
            <span class="timer-value">${config[config.length - 1].toFixed(1)} s</span>
            <img class="move" src="assets/icons/arrow-up.png" alt="Move Up" onclick="moveItem(${index}, -1)"/>
            <img class="move" src="assets/icons/arrow-down.png" alt="Move Down" onclick="moveItem(${index}, 1)"/>
            <img class="delete" src="assets/icons/trash.png" alt="Delete" onclick="deleteItem(${index})"/>
        </div>`
    ).join('');
    
    updateMovementUI();
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    createSliders();
    updateMovementUI();
    console.log('Init application with trajectory control');
});