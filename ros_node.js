const rclnodejs = require('rclnodejs');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

class JointTrajectoryController {
    constructor() {
        this.node = null;
        this.actionClient = null;
        this.jointPositions = Array(12).fill(0.0);
        this.jointNames = [
            'joint_1', 'joint_2', 'joint_3', 'joint_4', 
            'joint_5', 'joint_6', 'joint_7', 'joint_8',
            'joint_9', 'joint_10', 'joint_11', 'joint_12'
        ];
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.currentGoalHandle = null;
        this.isMoving = false;
        
        this.setupExpress();
        this.setupSocketIO();
    }

    async init() {
        try {
            await rclnodejs.init();
            
            this.node = rclnodejs.createNode('joint_trajectory_web_controller');
            
            // Crear cliente de acción para el controlador de trayectoria
            this.actionClient = new rclnodejs.ActionClient(
                this.node,
                'control_msgs/action/FollowJointTrajectory',
                '/joint_trajectory_controller/follow_joint_trajectory'
            );
            
            // Esperar a que el servidor de acción esté disponible
            console.log('Waiting for action server...');
            await this.actionClient.waitForServer(5000);
            console.log('Action server available!');
            
            rclnodejs.spin(this.node);
            
            console.log('ROS2 node and action client initialized successfully.');
            
        } catch (error) {
            console.error('Error initializing ROS2 node:', error);
            throw error;
        }
    }

    async moveToPosition(positions, duration = 2.0) {
        if (this.isMoving) {
            console.log('Robot is already moving, canceling previous goal...');
            if (this.currentGoalHandle) {
                this.currentGoalHandle.cancel();
            }
        }

        try {
            this.isMoving = true;
            
            // Crear el mensaje de trayectoria
            const FollowJointTrajectory = rclnodejs.require('control_msgs').action.FollowJointTrajectory;
            const JointTrajectory = rclnodejs.require('trajectory_msgs').msg.JointTrajectory;
            const JointTrajectoryPoint = rclnodejs.require('trajectory_msgs').msg.JointTrajectoryPoint;
            const Header = rclnodejs.require('std_msgs').msg.Header;
            
            const goal = new FollowJointTrajectory.Goal();
            
            // Crear la trayectoria
            const trajectory = new JointTrajectory();
            trajectory.joint_names = [...this.jointNames];
            
            // Crear header
            // const header = new Header();
            // header.stamp = this.node.now().toMsg();
            // header.frame_id = '';
            // trajectory.header = header;
            
            // Crear punto de trayectoria
            const point = new JointTrajectoryPoint();
            point.positions = [...positions];
            // point.velocities = [];
            // point.accelerations = [];
            // point.effort = [];
            
            // Configurar tiempo - usar segundos y nanosegundos
            const seconds = Math.floor(duration);
            const nanoseconds = Math.floor((duration - seconds) * 1e9);
            point.time_from_start = new rclnodejs.Time(duration);
            
            trajectory.points = [point];
            goal.trajectory = trajectory;
            
            // Debug: imprimir información del goal
            console.log('=== GOAL DEBUG INFO ===');
            console.log('Joint names:', trajectory.joint_names);
            console.log('Positions:', point.positions);
            console.log('Duration:', duration, 'seconds');
            console.log('Time from start:', point.time_from_start);
            console.log('Number of joints:', trajectory.joint_names.length);
            console.log('Number of positions:', point.positions.length);
            console.log('=======================');
            
            // Verificar que tenemos el número correcto de posiciones
            if (point.positions.length !== trajectory.joint_names.length) {
                throw new Error(`Position count (${point.positions.length}) doesn't match joint count (${trajectory.joint_names.length})`);
            }
            
            console.log(`Moving robot to positions: [${positions.map(p => p.toFixed(3)).join(', ')}] in ${duration}s`);
            
            // Enviar goal con tu implementación de callbacks
            this.currentGoalHandle = await this.actionClient.sendGoal(goal, 
                // Callback de feedback
                (feedback) => {
                    if (feedback.actual && feedback.actual.positions && feedback.actual.positions.length > 0) {
                        console.log('Feedback received:', feedback.actual.positions.map(p => p.toFixed(3)));
                        this.jointPositions = [...feedback.actual.positions];
                        this.io.emit('joint_positions_update', this.jointPositions);
                    }
                }
            );
            
            // Configurar callback de cancelación
            this.currentGoalHandle.isCanceled(() => {
                this.isMoving = false;
                console.log('Movement canceled by user');
                this.io.emit('movement_stopped');
            });
            
            // Configurar callback de éxito
            this.currentGoalHandle.isSucceeded((result) => {
                this.isMoving = false;
                console.log('Movement completed with result:', result);
                
                // Actualizar posiciones locales
                this.jointPositions = [...positions];
                
                // Notificar a los clientes web
                this.io.emit('movement_completed', {
                    positions: this.jointPositions,
                    success: true
                });
            });
            
            // Configurar callback de fallo
            this.currentGoalHandle.isAborted((result) => {
                this.isMoving = false;
                console.log('Movement aborted with result:', result);
                this.io.emit('movement_error', { error: 'Movement was aborted' });
            });
            
            this.currentGoalHandle.isAborted((result) => {
                this.isMoving = false;
                console.log('Movement aborted with result:', result);
                this.io.emit('movement_error', { error: 'Movement was rejected' });
            });
            
            return this.currentGoalHandle;
            
        } catch (error) {
            this.isMoving = false;
            console.error('Error moving robot:', error);
            this.io.emit('movement_error', { error: error.message });
            throw error;
        }
    }

    async executeTrajectorySequence(trajectoryPoints) {
        if (!trajectoryPoints || trajectoryPoints.length === 0) {
            throw new Error('No trajectory points provided');
        }

        try {
            this.isMoving = true;
            
            const FollowJointTrajectory = rclnodejs.require('control_msgs').action.FollowJointTrajectory;
            const JointTrajectory = rclnodejs.require('trajectory_msgs').msg.JointTrajectory;
            const JointTrajectoryPoint = rclnodejs.require('trajectory_msgs').msg.JointTrajectoryPoint;
            const Header = rclnodejs.require('std_msgs').msg.Header;
            
            const goal = new FollowJointTrajectory.Goal();
            
            // Crear la trayectoria
            const trajectory = new JointTrajectory();
            trajectory.joint_names = [...this.jointNames];
            
            // Crear header
            const header = new Header();
            header.stamp = this.node.now().toMsg();
            header.frame_id = '';
            trajectory.header = header;
            
            let cumulativeTime = 0.0;
            
            trajectory.points = trajectoryPoints.map((trajPoint, index) => {
                const point = new JointTrajectoryPoint();
                
                // trajPoint debería ser [pos1, pos2, ..., pos12, duration]
                const positions = trajPoint.slice(0, -1);
                const duration = trajPoint[trajPoint.length - 1];
                
                cumulativeTime += duration;
                
                point.positions = positions;
                point.velocities = [];
                point.accelerations = [];
                point.effort = [];
                
                // Configurar tiempo - usar segundos y nanosegundos
                const seconds = Math.floor(cumulativeTime);
                const nanoseconds = Math.floor((cumulativeTime - seconds) * 1e9);
                point.time_from_start = {
                    sec: seconds,
                    nanosec: nanoseconds
                };
                
                return point;
            });
            
            goal.trajectory = trajectory;
            
            console.log(`=== TRAJECTORY SEQUENCE DEBUG ===`);
            console.log(`Number of points: ${trajectoryPoints.length}`);
            console.log(`Total duration: ${cumulativeTime.toFixed(2)}s`);
            console.log(`Joint names: ${trajectory.joint_names}`);
            trajectory.points.forEach((point, idx) => {
                console.log(`Point ${idx + 1}: positions=[${point.positions.map(p => p.toFixed(3)).join(', ')}] time=${point.time_from_start.sec}.${Math.floor(point.time_from_start.nanosec / 1e6)}s`);
            });
            console.log(`================================`);
            
            console.log(`Executing trajectory sequence with ${trajectoryPoints.length} points`);
            
            this.currentGoalHandle = await this.actionClient.sendGoal(goal,
                // Callback de feedback
                (feedback) => {
                    if (feedback.actual && feedback.actual.positions && feedback.actual.positions.length > 0) {
                        console.log('Trajectory feedback:', feedback.actual.positions.map(p => p.toFixed(3)));
                        this.jointPositions = [...feedback.actual.positions];
                        this.io.emit('joint_positions_update', this.jointPositions);
                    }
                }
            );
            
            this.currentGoalHandle.isCanceled(() => {
                this.isMoving = false;
                console.log('Trajectory canceled by user');
                this.io.emit('movement_stopped');
            });
            
            this.currentGoalHandle.isSucceeded((result) => {
                this.isMoving = false;
                console.log('Trajectory sequence completed successfully');
                
                // Actualizar a la última posición
                const lastPoint = trajectoryPoints[trajectoryPoints.length - 1];
                this.jointPositions = lastPoint.slice(0, -1);
                
                this.io.emit('trajectory_completed', {
                    positions: this.jointPositions,
                    success: true
                });
            });
            
            this.currentGoalHandle.isAborted((result) => {
                this.isMoving = false;
                console.log('Trajectory aborted:', result);
                this.io.emit('trajectory_error', { error: 'Trajectory was aborted' });
            });
            
            this.currentGoalHandle.isRejected((result) => {
                this.isMoving = false;
                console.log('Trajectory rejected:', result);
                this.io.emit('trajectory_error', { error: 'Trajectory was rejected' });
            });
            
            return this.currentGoalHandle;
            
        } catch (error) {
            this.isMoving = false;
            console.error('Error executing trajectory sequence:', error);
            this.io.emit('trajectory_error', { error: error.message });
            throw error;
        }
    }

    async stopMovement() {
        if (this.currentGoalHandle && this.isMoving) {
            try {
                this.currentGoalHandle.cancel();
                this.isMoving = false;
                console.log('Movement stopped');
                this.io.emit('movement_stopped');
            } catch (error) {
                console.error('Error stopping movement:', error);
            }
        }
    }

    updateJointPosition(jointIndex, position) {
        if (jointIndex >= 0 && jointIndex < this.jointPositions.length) {
            this.jointPositions[jointIndex] = parseFloat(position);
        }
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {            
            console.log('Client connected');
            socket.emit('joint_positions', this.jointPositions);
            socket.emit('robot_status', { isMoving: this.isMoving });
            
            // Mover a una posición específica
            socket.on('move_to_position', async (data) => {
                const { positions, duration = 2.0 } = data;
                try {
                    await this.moveToPosition(positions, duration);
                } catch (error) {
                    socket.emit('movement_error', { error: error.message });
                }
            });
            
            // Ejecutar secuencia de trayectoria
            socket.on('execute_trajectory', async (data) => {
                const { trajectoryPoints } = data;
                try {
                    await this.executeTrajectorySequence(trajectoryPoints);
                } catch (error) {
                    socket.emit('trajectory_error', { error: error.message });
                }
            });
            
            // Actualización de joint individual (solo actualiza el valor local, no mueve el robot)
            socket.on('update_joint', (data) => {
                const { jointIndex, position } = data;
                this.updateJointPosition(jointIndex, position);
                socket.broadcast.emit('joint_updated', { jointIndex, position });
            });
            
            // Mover el robot a las posiciones actuales de los sliders
            socket.on('move_robot', async (data) => {
                const { duration = 2.0 } = data;
                try {
                    await this.moveToPosition(this.jointPositions, duration);
                } catch (error) {
                    socket.emit('movement_error', { error: error.message });
                }
            });
            
            // Detener movimiento
            socket.on('stop_movement', async () => {
                await this.stopMovement();
            });
            
            // Guardar configuración
            socket.on('save_configuration', () => {
                socket.emit('configuration_saved', { positions: [...this.jointPositions] });
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });
    }

    startServer(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Web server is running on http://localhost:${port}`);
        });
    }

    async shutdown() {        
        if (this.currentGoalHandle && this.isMoving) {
            await this.currentGoalHandle.cancelGoal();
        }
        
        if (this.actionClient) {
            this.actionClient.destroy();
        }
        
        if (this.node) {
            this.node.destroy();
        }
        
        await rclnodejs.shutdown();
        process.exit(0);
    }
}

async function main() {
    const controller = new JointTrajectoryController();
    
    try {
        await controller.init();
        controller.startServer(3000);
        
        console.log('- Web server: http://localhost:3000');
        console.log('- Action client connected to: /joint_trajectory_controller/follow_joint_trajectory');
        console.log('- Press Ctrl+C to exit');
        
    } catch (error) {
        console.error('Failed to initialize:', error);
        process.exit(1);
    }
    
    process.on('SIGINT', async () => {
        console.log('Shutting down...');
        await controller.shutdown();
    });
    
    process.on('SIGTERM', async () => {
        console.log('Shutting down...');
        await controller.shutdown();
    });
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});