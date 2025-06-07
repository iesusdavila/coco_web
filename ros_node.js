const rclnodejs = require('rclnodejs');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

class JointController {
    constructor() {
        this.node = null;
        this.publisher = null;
        this.timer = null;
        this.jointPositions = Array(12).fill(0.0);
        this.jointNames = Array.from({ length: 12 }, (_, i) => `joint_${i + 1}`);
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.setupExpress();
        this.setupSocketIO();
    }

    async init() {
        try {
            console.log('Inicializando ROS2...');
            await rclnodejs.init();
            
            console.log('Creando nodo ROS2...');
            this.node = rclnodejs.createNode('joint_controller_web');
            
            console.log('Creando publisher para joint_states...');
            this.publisher = this.node.createPublisher('sensor_msgs/msg/JointState', '/joint_states');
            
            console.log('Creando timer...');
            this.timer = this.node.createTimer(100, () => {
                this.publishJointStates();
            });
            
            console.log('Iniciando spinner de ROS2...');
            rclnodejs.spin(this.node);
            
            console.log('ROS2 inicializado correctamente!');
            
        } catch (error) {
            console.error('Error inicializando ROS2:', error);
            throw error;
        }
    }

    publishJointStates() {
        try {
            const currentTime = this.node.now();

            console.log(currentTime.toMsg());

            const JointState = rclnodejs.require('sensor_msgs').msg.JointState;
            const message_final = new JointState();
            message_final.header.stamp = currentTime.toMsg(); 
            message_final.header.frame_id = '';
            message_final.name = this.jointNames;
            message_final.position = [...this.jointPositions];
            message_final.velocity = [];
            message_final.effort = [];
            this.publisher.publish(message_final);
            
        } catch (error) {
            console.error('Error publicando joint states:', error);
            console.error('Intentando con timestamp simplificado...');
        }
    }

    updateJointPosition(jointIndex, position) {
        if (jointIndex >= 0 && jointIndex < this.jointPositions.length) {
            this.jointPositions[jointIndex] = parseFloat(position);
            console.log(`Joint ${jointIndex + 1} actualizado a: ${position}`);
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
            console.log('Cliente conectado:', socket.id);
            
            socket.emit('joint_positions', this.jointPositions);
            
            socket.on('update_joint', (data) => {
                const { jointIndex, position } = data;
                this.updateJointPosition(jointIndex, position);
                
                socket.broadcast.emit('joint_updated', { jointIndex, position });
            });
            
            socket.on('save_configuration', () => {
                console.log('Configuración guardada:', this.jointPositions);
                socket.emit('configuration_saved', { positions: [...this.jointPositions] });
            });
            
            socket.on('disconnect', () => {
                console.log('Cliente desconectado:', socket.id);
            });
        });
    }

    startServer(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Servidor web iniciado en http://localhost:${port}`);
        });
    }

    async shutdown() {
        console.log('Cerrando aplicación...');
        
        if (this.timer) {
            this.timer.cancel();
        }
        
        if (this.node) {
            this.node.destroy();
        }
        
        await rclnodejs.shutdown();
        process.exit(0);
    }
}

async function main() {
    const controller = new JointController();
    
    try {
        await controller.init();
        controller.startServer(3000);
        
        console.log('\n=== Robot Joint Controller Iniciado ===');
        console.log('- Servidor web: http://localhost:3000');
        console.log('- Nodo ROS2: joint_controller_web');
        console.log('- Publicando en: /joint_states');
        console.log('- Presiona Ctrl+C para salir\n');
        
    } catch (error) {
        console.error('Error en main:', error);
        process.exit(1);
    }
    
    process.on('SIGINT', async () => {
        console.log('\nRecibida señal SIGINT, cerrando...');
        await controller.shutdown();
    });
    
    process.on('SIGTERM', async () => {
        console.log('\nRecibida señal SIGTERM, cerrando...');
        await controller.shutdown();
    });
}

main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});