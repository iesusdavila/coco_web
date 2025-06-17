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

function showMenu() {
    document.getElementById('viewMenu').style.display = 'none';
    document.getElementById('closeMenu').style.display = 'block';
    document.getElementById('favPoses').style.display = 'block';
}

function closeMenu() {
    document.getElementById('viewMenu').style.display = 'block';
    document.getElementById('closeMenu').style.display = 'none';
    document.getElementById('favPoses').style.display = 'none';
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
            <div>
                <img class="right-arrow" id="viewMore${index}" src="assets/icons/right-arrow.png" alt="View More" onclick="viewMore(${index})"/>
                <img class="left-arrow" id="viewLess${index}" src="assets/icons/left-arrow.png" alt="View Less" onclick="viewLess(${index})"/>
            </div>
            <h3>${pose.name}</h3>
            <img class="add" id="addConfigFavPose${index}" src="assets/icons/add.png" alt="Add to List" onclick="addToListPoses(${index})"/>
            <div>
                <img class="edit-fav-pose" id="editFavPose${index}" src="assets/icons/edit-2.png" alt="Edit" onclick="editFavPose(${index})"/>
                <img class="cancel-edit-fav-pose" id="cancelFavPose${index}" src="assets/icons/cancel.png" alt="Cancel" onclick="cancelEditFavPose(${index})"/>
            </div>
            <div>
                <img class="delete-fav-pose" id="deleteFavPose${index}" src="assets/icons/trash.png" alt="Delete" onclick="deleteFavPose(${index})"/>
                <img class="ok-edit-fav-pose" id="okFavPose${index}" src="assets/icons/ok.png" alt="Ok" onclick="okEditFavPose(${index})"/>
            </div>
        </div>
        <div class="fav-pose-values" id="favPoseValues${index}">       
            ${pose.values.map((values, i) => 
                `<div class="fav-pose-values-item">
                    ${values.slice(0,-1).map((val, i_val) => `<span>Joint${i_val+1}: ${val.toFixed(2)}</span>`).join(', ')}
                    <span>Timer: ${values[values.length - 1].toFixed(1)} s</span>
                </div>`
            ).join('')}
        </div>
        <div class="edit-fav-pose-values" id="editFavPoseValues${index}">
            <div>
                <label for="favPoseName${index}">Name:</label>
                <input type="text" id="favPoseName${index}" value="${pose.name}">
            </div>
            ${pose.values[0].slice(0, -1).map((values, i) => 
                `<div>
                    <label for="favJoint${index}_${i}">Joint ${i + 1}:</label>
                    <input type="number" id="favJoint${index}_${i}" value="${values.toFixed(2)}" step="0.01">
                </div>`
            ).join('')}
            <div>
                <label for="favTimer${index}">Timer (s):</label>
                <input type="number" id="favTimer${index}" value="${pose.values[0][pose.values[0].length - 1].toFixed(1)}" step="0.1" min="0.1" max="60">
            </div>                
        </div>
    `
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

function editFavPose(index) {
    document.getElementById(`editFavPose${index}`).style.display = 'none';
    document.getElementById(`cancelFavPose${index}`).style.display = 'block';
    document.getElementById(`okFavPose${index}`).style.display = 'block';
    document.getElementById(`deleteFavPose${index}`).style.display = 'none';
    document.getElementById(`addConfigFavPose${index}`).style.display = 'none';
    document.getElementById(`editFavPoseValues${index}`).style.display = 'block';
}

function cancelEditFavPose(index) {
    document.getElementById(`editFavPose${index}`).style.display = 'block';
    document.getElementById(`cancelFavPose${index}`).style.display = 'none';
    document.getElementById(`okFavPose${index}`).style.display = 'none';
    document.getElementById(`deleteFavPose${index}`).style.display = 'block';
    document.getElementById(`addConfigFavPose${index}`).style.display = 'block';
    document.getElementById(`editFavPoseValues${index}`).style.display = 'none';

    const pose = fav_poses[index];
    document.getElementById(`favPoseName${index}`).value = pose.name;
    pose.values[0].slice(0, -1).forEach((value, i) => {
        document.getElementById(`favJoint${index}_${i}`).value = value.toFixed(2);
    });
    document.getElementById(`favTimer${index}`).value = pose.values[0][pose.values[0].length - 1].toFixed(1);
}

function okEditFavPose(index) {
    document.getElementById(`editFavPose${index}`).style.display = 'block';
    document.getElementById(`cancelFavPose${index}`).style.display = 'none';
    document.getElementById(`okFavPose${index}`).style.display = 'none';
    document.getElementById(`deleteFavPose${index}`).style.display = 'block';
    document.getElementById(`addConfigFavPose${index}`).style.display = 'block';
    document.getElementById(`editFavPoseValues${index}`).style.display = 'none';

    const oldName = fav_poses[index].name;
    const newName = document.getElementById(`favPoseName${index}`).value.trim();
    if (!newName) {
        alert('El nombre de la pose no puede estar vacío.');
        return;
    }
    const newValues = [];
    for (let i = 0; i < jointNames.length; i++) {
        const jointValue = parseFloat(document.getElementById(`favJoint${index}_${i}`).value);
        if (isNaN(jointValue)) {
            alert(`Valor inválido para Joint ${i + 1}.`);
            return;
        }
        newValues.push(jointValue);
    }
    const timerValue = parseFloat(document.getElementById(`favTimer${index}`).value);
    if (isNaN(timerValue) || timerValue <= 0 || timerValue > 60) {
        alert('Por favor, ingresa un valor de temporizador válido mayor que 0 y menor o igual a 60 segundos.');
        return;
    }
    newValues.push(timerValue);
    fav_poses[index] = { name: newName, values: [newValues] };

    socket.emit('update_favorite_poses', {new_name: newName, old_name: oldName, values: newValues});

    updateFavPosesList();
}

function deleteFavPose(index) {
    if (index < 0 || index >= fav_poses.length) {
        console.error('Index out of range:', index);
        return;
    }
    
    const poseName = fav_poses[index].name;
    if (confirm(`Are you sure you want to delete the favorite pose '${poseName}'?`)) {
        socket.emit('delete_favorite_pose', { name: poseName });
        fav_poses.splice(index, 1);
        updateFavPosesList();
    }
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

socket.on('favorite_pose_updated', (data) => {
    alert(`Favorite pose '${data.new_name}' updated successfully!`);
    initialListFavPoses();
});

socket.on('favorite_pose_deleted', (data) => {
    alert(`Favorite pose '${data.name}' deleted successfully!`);
    initialListFavPoses();
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