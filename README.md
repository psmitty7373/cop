# MCSCOP

## About MCSCOP
MCSCOP is a node.js based web application that allows a team to create a "Common Operating Picture" during a network intrusion event.  The tool allows real-time collaborative network diagraming, event tracking, and operator note-taking.  Additionally the tool allows file sharing and chat to facilitate operator interaction and callaboration.

## Installation
### Installing on Centos 7
```bash
git clone https://github.com/psmitty7373/mcscop.git
cd mcscop/
./install-cop.sh
```
The install script will walk through getting any dependencies and creating an initial admin user and password.  The install script will also install PM2 run MCSCOP as a service.  Once completed MCSCOP will listen on port 3000 and can be accessed via a web browser  at http://<centos ip>:3000.
 
## Features

### Collaborative Diagramming

### Event Tracking and Assignment

### Operator Action Note-taking (OPNotes)

### General Notes

### File Sharing
