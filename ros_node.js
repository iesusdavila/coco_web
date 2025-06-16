const rclnodejs = require('rclnodejs');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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
            
            this.actionClient = new rclnodejs.ActionClient(
                this.node,
                'control_msgs/action/FollowJointTrajectory',
                '/joint_trajectory_controller/follow_joint_trajectory'
            );
            
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
                this.currentGoalHandle.cancelGoal();
            }
        }

        try {
            this.isMoving = true;
            
            const FollowJointTrajectory = rclnodejs.require('control_msgs').action.FollowJointTrajectory;
            const JointTrajectory = rclnodejs.require('trajectory_msgs').msg.JointTrajectory;
            const JointTrajectoryPoint = rclnodejs.require('trajectory_msgs').msg.JointTrajectoryPoint;
            
            const goal = new FollowJointTrajectory.Goal();
            
            const trajectory = new JointTrajectory();
            trajectory.joint_names = [...this.jointNames];
            
            const point = new JointTrajectoryPoint();
            point.positions = [...positions];

            point.time_from_start = new rclnodejs.Time(duration).toMsg();
            
            trajectory.points = [point];
            goal.trajectory = trajectory;
            
            if (point.positions.length !== trajectory.joint_names.length) {
                throw new Error(`Position count (${point.positions.length}) doesn't match joint count (${trajectory.joint_names.length})`);
            }
                        
            this.currentGoalHandle = await this.actionClient.sendGoal(goal, 
                (feedback) => {
                    if (feedback.actual && feedback.actual.positions && feedback.actual.positions.length > 0) {
                        this.jointPositions = [...feedback.actual.positions];
                        this.io.emit('joint_positions_update', this.jointPositions);
                    }
                }
            );
            
            // Configuration of cancel callback
            this.currentGoalHandle.isCanceled(() => {
                this.isMoving = false;
                this.io.emit('movement_stopped');
            });
            
            // Configuration of success callback
            this.currentGoalHandle.isSucceeded((result) => {
                this.isMoving = false;
                
                this.jointPositions = [...positions];
                
                this.io.emit('movement_completed', {
                    positions: this.jointPositions,
                    success: true
                });
            });
            
            // Configuration of abort callback
            this.currentGoalHandle.isAborted((result) => {
                this.isMoving = false;
                this.io.emit('movement_error', { error: 'Movement was aborted' });
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
            
            const trajectory = new JointTrajectory();
            trajectory.joint_names = [...this.jointNames];
            
            const header = new Header();
            header.stamp = this.node.now().toMsg();
            header.frame_id = '';
            trajectory.header = header;
            
            let cumulativeTime = 0.0;
            
            trajectory.points = trajectoryPoints.map((trajPoint, index) => {
                const point = new JointTrajectoryPoint();
                
                const positions = trajPoint.slice(0, -1);
                const duration = trajPoint[trajPoint.length - 1];
                
                cumulativeTime += duration;
                
                point.positions = positions;
                point.velocities = [];
                point.accelerations = [];
                point.effort = [];
                
                const seconds = Math.floor(cumulativeTime);
                const nanoseconds = Math.floor((cumulativeTime - seconds) * 1e9);
                point.time_from_start = {
                    sec: seconds,
                    nanosec: nanoseconds
                };
                
                return point;
            });
            
            goal.trajectory = trajectory;
                
            this.currentGoalHandle = await this.actionClient.sendGoal(goal,
                (feedback) => {
                    if (feedback.actual && feedback.actual.positions && feedback.actual.positions.length > 0) {
                        this.jointPositions = [...feedback.actual.positions];
                        this.io.emit('joint_positions_update', this.jointPositions);
                    }
                }
            );
            
            this.currentGoalHandle.isCanceled(() => {
                this.isMoving = false;
                this.io.emit('movement_stopped');
            });
            
            this.currentGoalHandle.isSucceeded((result) => {
                this.isMoving = false;
                
                const lastPoint = trajectoryPoints[trajectoryPoints.length - 1];
                this.jointPositions = lastPoint.slice(0, -1);
                
                this.io.emit('trajectory_completed', {
                    positions: this.jointPositions,
                    success: true
                });
            });
            
            this.currentGoalHandle.isAborted((result) => {
                this.isMoving = false;
                this.io.emit('trajectory_error', { error: 'Trajectory was aborted' });
            });
            
            this.currentGoalHandle.isRejected((result) => {
                this.isMoving = false;
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
        if (this.isMoving) {
            try {
                this.currentGoalHandle.cancelGoal();
                this.isMoving = false;
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
            
            socket.on('move_to_position', async (data) => {
                const { positions, duration } = data;
                try {
                    await this.moveToPosition(positions, duration);
                } catch (error) {
                    socket.emit('movement_error', { error: error.message });
                }
            });
            
            socket.on('execute_trajectory', async (data) => {
                const { trajectoryPoints } = data;
                try {
                    await this.executeTrajectorySequence(trajectoryPoints);
                } catch (error) {
                    socket.emit('trajectory_error', { error: error.message });
                }
            });
            
            socket.on('update_joint', (data) => {
                const { jointIndex, position } = data;
                this.updateJointPosition(jointIndex, position);
                socket.broadcast.emit('joint_updated', { jointIndex, position });
            });
            
            socket.on('stop_movement', async () => {
                await this.stopMovement();
            });
            
            socket.on('save_configuration', () => {
                socket.emit('configuration_saved', { positions: [...this.jointPositions] });
            });

            socket.on('save_configuration_from_fav', (data) => {
                const { name, values } = data;
                socket.emit('configuration_saved_from_fav', { positions: values });
            });
            
            socket.on('save_favorite_pose', (data) => {
                const { name, values } = data;
                if (!name || !Array.isArray(values) || values.length !== 13) {
                    socket.emit('favorite_pose_error', { error: 'Invalid data for favorite pose.' });
                    return;
                }
                const line = `${name}: ${values.map(v => v.toFixed(3)).join(', ')} \n`;
                const filePath = path.join(__dirname, 'public', 'assets', 'files', 'favorite_poses.txt');
                fs.appendFile(filePath, line, (err) => {
                    if (err) {
                        console.error('Error saving favorite pose:', err);
                        socket.emit('favorite_pose_error', { error: 'Failed to save favorite pose.' });
                    } else {
                        socket.emit('favorite_pose_saved', { name, values });
                    }
                });
            });

            socket.on('update_favorite_poses', (data) => {
                const { new_name, old_name,values } = data;
                const filePath = path.join(__dirname, 'public', 'assets', 'files', 'favorite_poses.txt');
                fs.readFile(filePath, 'utf8', (err, content) => {
                    if (err) {
                        console.error('Error reading favorite poses file:', err);
                        socket.emit('favorite_pose_error', { error: 'Failed to read favorite poses.' });
                        return;
                    }
                    const lines = content.split('\n').filter(line => line.trim() !== '');
                    const updatedLines = lines.map(line => {
                        console.log(line);
                        console.log(old_name);
                        console.log(line.startsWith(old_name + ':'));
                        console.log(new_name);
                        console.log(line.startsWith(new_name + ':'));
                        if (line.startsWith(old_name + ':')) {
                            return `${new_name}: ${values.map(v => v.toFixed(3)).join(', ')}`;
                        }
                        return line;
                    });
                    fs.writeFile(filePath, updatedLines.join('\n') + '\n', (err) => {
                        if (err) {
                            console.error('Error updating favorite poses:', err);
                            socket.emit('favorite_pose_error', { error: 'Failed to update favorite poses.' });
                        } else {
                            socket.emit('favorite_pose_updated', { new_name, values });
                        }
                    });
                });
            }
            );

            socket.on('delete_favorite_pose', (name) => {
                const filePath = path.join(__dirname, 'public', 'assets', 'files', 'favorite_poses.txt');
                fs.readFile(filePath, 'utf8', (err, content) => {
                    if (err) {
                        console.error('Error reading favorite poses file:', err);
                        socket.emit('favorite_pose_error', { error: 'Failed to read favorite poses.' });
                        return;
                    }
                    const lines = content.split('\n').filter(line => line.trim() !== '');
                    const updatedLines = lines.filter(line => !line.startsWith(name + ':'));
                    fs.writeFile(filePath, updatedLines.join('\n') + '\n', (err) => {
                        if (err) {
                            console.error('Error deleting favorite pose:', err);
                            socket.emit('favorite_pose_error', { error: 'Failed to delete favorite pose.' });
                        } else {
                            socket.emit('favorite_pose_deleted', { name });
                        }
                    });
                });
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