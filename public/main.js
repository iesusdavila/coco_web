const socket = io();

const jointNames = Array.from({ length: 12 }, (_, i) => `joint_${i + 1}`);
const sliders = {};
const poses = [];
const fav_poses = [];
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

const statusElement = document.getElementById('status');
const slidersDiv = document.getElementById('sliders');
const configListDiv = document.getElementById('configList');

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
            
            socket.emit('update_joint', {
                jointIndex: index,
                position: value
            });
        });

        sliders[joint] = slider;
    });
}

function initialListFavPoses() {
    fav_poses.length = 0; 
    fetch('assets/files/favorite_poses.txt')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => {
                const [name, ...values] = line.split(':').map(val => val.trim());
                values_list = values.map(val => val.split(',').map(s => parseFloat(s.trim())));
                fav_poses.push({ name, values: values_list });
            });
            updateFavPosesList();
        })
        .catch(error => console.error('Error loading favorite poses:', error));
}

function updateFavPosesList() {
    const favPosesList = document.querySelector('.fav-poses-list');
    if (!favPosesList) return;

    console.log(fav_poses);
    favPosesList.innerHTML = fav_poses.map((pose, index) => 
        `<div class="fav-pose-item">
            <img class="right-arrow" id="viewMore${index}" src="assets/icons/right-arrow.png" alt="View More" onclick="viewMore(${index})"/>
            <img class="left-arrow" id="viewLess${index}" src="assets/icons/left-arrow.png" alt="View Less" onclick="viewLess(${index})"/>
            <h3>${pose.name}</h3>
            <img class="add" src="assets/icons/add.png" alt="Add to List" onclick="addToListPoses(${index})"/>
            <img class="edit-fav-pose" src="assets/icons/edit-2.png" alt="Edit" onclick="editFavPose(${index})"/>
            <img class="delete-fav-pose" src="assets/icons/remove.png" alt="Delete" onclick="deleteFavPose(${index})"/>
        </div>
        <div class="fav-pose-values" id="favPoseValues${index}">            
            ${pose.values.map((values, i) => 
                `<div class="fav-pose-values-item">
                    ${values.slice(0,-1).map((val, i_val) => `<span>Joint${i_val+1}: ${val.toFixed(2)}</span>`).join(', ')}
                    <span>Timer: ${values[values.length - 1].toFixed(1)} s</span>
                </div>`
            ).join('')}
        </div>`
    ).join('');
}

function viewMore(index) {
    document.getElementById(`viewMore${index}`).style.display = 'none';
    document.getElementById(`viewLess${index}`).style.display = 'block';
    document.getElementById(`favPoseValues${index}`).style.display = 'block';
}

function viewLess(index) {
    document.getElementById(`viewMore${index}`).style.display = 'block';
    document.getElementById(`viewLess${index}`).style.display = 'none';
    document.getElementById(`favPoseValues${index}`).style.display = 'none';
}

function addToListPoses(index) {    
    const pose = fav_poses[index];

    socket.emit('save_configuration_from_fav', {
        name: pose.name,
        values: pose.values
    });
}

function getCurrentSliderPositions() {
    return jointNames.map(joint => parseFloat(sliders[joint].value));
}

function moveRobotToCurrent() {
    if (isRobotMoving) {
        alert('El robot ya se está moviendo. Espera a que termine o detén el movimiento.');
        return;
    }
    
    const positions = getCurrentSliderPositions();
    const duration = parseFloat(document.getElementById('timerInput').value); 

    socket.emit('move_to_position', { positions, duration });
}

function stopEmergencyRobot() {
    socket.emit('stop_movement');
}

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
    
    if (!data.success) {
        alert('El movimiento falló. Revisa la consola para más detalles.');
    }
});

socket.on('trajectory_completed', (data) => {
    isRobotMoving = false;
    updateMovementUI();
    
    if (data.success) {
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
});

socket.on('configuration_saved', (data) => {
    poses.push([...data.positions, parseFloat(document.getElementById('timerInput').value)]);
    updateConfigList();
});

socket.on('configuration_saved_from_fav', (data) => {
    poses.push(data.positions[0]);
    updateConfigList();
});

socket.on('favorite_pose_saved', (data) => {
    alert(`Favorite pose '${data.name}' saved successfully!`);
});

socket.on('favorite_pose_error', (data) => {
    alert(`Error saving favorite pose: ${data.error}`);
});

function updateMovementUI() {
    const moveButton = document.getElementById('moveButton');
    const stopButton = document.getElementById('stopButton');
    const executeButton = document.getElementById('executeButton');
    
    if (moveButton) {
        moveButton.disabled = isRobotMoving;
        moveButton.textContent = isRobotMoving ? 'Moving...' : 'Move Robot';
    }
    
    if (executeButton) {
        executeButton.disabled = isRobotMoving || poses.length === 0;
    }
    
    if (isRobotMoving) {
        statusElement.textContent = 'Moving...';
        statusElement.className = 'status moving';
    } else if (statusElement.className.includes('connected')) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'status connected';
    }
}

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

function editPose(index) {
    if (index < 0 || index >= poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    const config = poses[index];
    jointNames.forEach((joint, i) => {
        sliders[joint].value = config[i];
        document.getElementById(`${joint}_val`).textContent = config[i].toFixed(2);
        const configItem = document.getElementById(`configItem${i}`);
        if (configItem) {
            const iconEditImg = configItem.querySelector('.edit');
            if (iconEditImg) {
                iconEditImg.style.opacity = '0.4';
                iconEditImg.style.pointerEvents = 'none';
                iconEditImg.style.cursor = 'not-allowed';
            }
        }
    });
    document.getElementById('timerInput').value = config[config.length - 1].toFixed(1);
    document.getElementById('savePoseButton').disabled = true;
    
    const cancelBtn = document.getElementById('cancelButton');
    cancelBtn.style.display = 'Block';
    cancelBtn.onclick = () => {
        cancelEditPose(index);
    }

    const saveBtn = document.getElementById('saveButton');
    saveBtn.style.display = 'Block';
    saveBtn.onclick = () => {
        saveEditedPose(index);
    }
}

function cancelEditPose(index) {
    if (index < 0 || index >= poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    reseatJoints();

    document.getElementById('timerInput').value = 2.0;
    hiddenEditBtns();
}

function saveEditedPose(index) {
    const timerValue = parseFloat(document.getElementById('timerInput').value);
    if (isNaN(timerValue) || timerValue <= 0 || timerValue > 60) {
        alert('Please enter a valid timer value greater than 0 and less than or equal to 60 seconds.');
        return;
    }
    const updatedConfig = getCurrentSliderPositions();
    updatedConfig.push(timerValue);
    poses[index] = updatedConfig;
    updateConfigList();
    hiddenEditBtns();
}

function hiddenEditBtns() {
    document.getElementById('savePoseButton').disabled = false;
    const saveBtn = document.getElementById('saveButton');
    saveBtn.style.display = 'none';
    const cancelBtn = document.getElementById('cancelButton');
    cancelBtn.style.display = 'none';
    const editIcons = document.querySelectorAll('.edit');
    editIcons.forEach(icon => {
        icon.style.opacity = '1';
        icon.style.pointerEvents = 'auto';
        icon.style.cursor = 'pointer';
    });
}

function saveFavPose(index) {
    if (index < 0 || index >= poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    const pose = poses[index];
    const poseName = prompt('Enter a name for the favorite pose:');
    if (!poseName || poseName.trim() === '') {
        alert('Pose name cannot be empty.');
        return;
    }
    socket.emit('save_favorite_pose', {
        name: poseName.trim(),
        values: pose
    });
    // fav_poses.push([...pose]);
    initialListFavPoses();
}

function updateConfigList() {
    if (poses.length === 0) {
        configListDiv.innerHTML = '<div class="config-item">There are no saved poses.</div>';
        updateMovementUI();
        return;
    }
    
    configListDiv.innerHTML = poses.map((config, index) => 
        `<div class="config-item-container" id="configItem${index}">
            <div>
                <img class="move" src="assets/icons/arrow-up.png" alt="Move Up" onclick="moveItem(${index}, -1)"/>            
                <div class="index-item">
                    <span class="index">${index + 1}</span>
                </div>
                <img class="move" src="assets/icons/arrow-down.png" alt="Move Down" onclick="moveItem(${index}, 1)"/>
            </div>
            <div class="config-item">
                ${config.slice(0, -1).map((val, i) => `<span class="joint-value">${jointNames[i].replace('_', ' ')}: ${val.toFixed(2)}</span>`).join(', ')}
            </div>
            <span class="timer-value">${config[config.length - 1].toFixed(1)} s</span>
            <img class="play" src="assets/icons/play.png" alt="Play" onclick="socket.emit('execute_single_pose', { pose: config })"/>
            <!-- <img class="pause" src="assets/icons/pause.png" alt="Pause" onclick="socket.emit('pause_movement')"/> -->
            <img class="save-fav" src="assets/icons/save.png" alt="Save" onclick="saveFavPose(${index})"/>  
            <img class="edit" src="assets/icons/edit.png" alt="Edit" onclick="editPose(${index})"/>
            <img class="delete" src="assets/icons/trash.png" alt="Delete" onclick="deleteItem(${index})"/>
        </div>`
    ).join('');
    
    updateMovementUI();
}

document.addEventListener('DOMContentLoaded', () => {
    initialListFavPoses();
    createSliders();
    updateMovementUI();
});