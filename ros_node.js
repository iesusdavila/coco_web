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
            await rclnodejs.init();
            
            this.node = rclnodejs.createNode('joint_controller_web');
            
            this.publisher = this.node.createPublisher('sensor_msgs/msg/JointState', '/joint_states');
            
            this.timer = this.node.createTimer(100, () => {
                this.publishJointStates();
            });
            
            rclnodejs.spin(this.node);
            
            console.log('ROS2 node and publisher initialized successfully.');
            
        } catch (error) {
            console.error('Error initializing ROS2 node:', error);
            throw error;
        }
    }

    publishJointStates() {
        try {
            const currentTime = this.node.now();

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
            console.error('Error publishing joint states:', error);
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
            socket.emit('joint_positions', this.jointPositions);
            
            socket.on('update_joint', (data) => {
                const { jointIndex, position } = data;
                this.updateJointPosition(jointIndex, position);
                
                socket.broadcast.emit('joint_updated', { jointIndex, position });
            });
            
            socket.on('save_configuration', () => {
                socket.emit('configuration_saved', { positions: [...this.jointPositions] });
            });
            
            socket.on('disconnect', () => {
                console.log('Disconnected from client');
            });
        });
    }

    startServer(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Web server is running on http://localhost:${port}`);
        });
    }

    async shutdown() {        
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
        
        console.log('- Web server: http://localhost:3000');
        console.log('- Press Ctrl+C to exit');
        
    } catch (error) {
        process.exit(1);
    }
    
    process.on('SIGINT', async () => {
        await controller.shutdown();
    });
    
    process.on('SIGTERM', async () => {
        await controller.shutdown();
    });
}

main().catch(error => {
    process.exit(1);
});