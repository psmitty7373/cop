# COP

## About COP
COP is a node.js based web application that allows a team to create a "Common Operating Picture" during a incident, CTF, network audit, etc.  COP allows real-time collaborative network diagraming, event tracking, note-taking, and coordination.  Additionally the tool allows file-sharing and chatting to facilitate real-time user interaction and collaboration.

## Installation
### Installing on Debian 9+
```bash
git clone https://github.com/psmitty7373/cop.git
cd cop/
./install-cop-apt.sh
```

### Installing on Centos 7
```bash
git clone https://github.com/psmitty7373/cop.git
cd cop/
./install-cop.sh
```

The install script will walk through getting any dependencies and creating an initial admin user and password.  The script can also establish a systemd service for the cop. Once completed COP will listen on port 3000 and can be accessed via a web browser at http://<server ip>:3000.
 
## Features

### Collaborative Diagramming

### Event Tracking and Assignment

### Operator Action Note-taking (OPNotes)

### General Notes

### File Sharing

### Chat

### API access
