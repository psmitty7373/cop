#!/bin/sh
echo "[*] This script installs the required packages to run ctfcop"
echo "    The following packages will be installed: curl, mysql-server,"
echo "    mysql-client, mongodb, nodejs, and npm."
echo "    You may be prompted to provide your sudo password."
echo ""
echo "[*] Installing to /opt/ctfcop."
echo ""
sudo mkdir /opt/ctfcop
sudo mkdir /opt/ctfcop/mission_files
sudo mkdir /opt/ctfcop/temp_uploads
sudo cp -r * /opt/ctfcop/
sudo groupadd ctfcop
sudo useradd ctfcop -s /bin/false -m -g ctfcop -G ctfcop
sudo chown ctfcop.ctfcop /opt/ctfcop/mission_files
sudo chown ctfcop.ctfcop /opt/ctfcop/temp_uploads

while true; do
    read -p "[!] Do you need to install or update packages and dependicies? " yn
    case $yn in
        [Yy]* ) ans=1; break;;
        [Nn]* ) ans=0; break;;
        * ) echo "[!] Please select yes or no.";;
    esac
done
if [ $ans -eq 1 ]; then
    sudo apt-get update
    sudo apt-get upgrade
    sudo apt-get install curl gnupg
    wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | sudo apt-key add -
    echo "deb http://repo.mongodb.org/apt/debian stretch/mongodb-org/4.2 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.2.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org mongodb-org-shell mongodb-org-server mongodb-org-mongos
    curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
    sudo apt-get install nodejs
    curl https://www.npmjs.com/install.sh | sudo sh
    npm install
    sudo systemctl enable mongod.service
    sudo systemctl start mongod.service
fi
echo ""
echo "[*] Creating initial admin.  Please provide a password for the"
echo "    default admin user."
echo ""
while true; do
    echo -n "Password: "
    read pass
    echo -n "Confirm password: "
    read cpass
    echo ""
    if [ "$pass" = "$cpass" ]; then
        node support.js $pass
        break;
    fi
    echo "[!] Passwords do not match, please try again."
done
while true; do
    read -p "[!] Do you want to enable systemd for the cop? " yn
    case $yn in
        [Yy]* ) ans=1; break;;
        [Nn]* ) ans=0; break;;
        * ) echo "[!] Please select yes or no.";;
    esac
done
if [ $ans -eq 1 ]; then
    sudo cp ctfcop.service /lib/systemd/system/ctfcop.service
    sudo systemctl daemon-reload
    sudo systemctl start ctfcop
else
    echo "[!] To run ctfcop use: node app.js from the ctfcop directory."
    echo "    Persistent install is possible using systemd."
fi
echo ""
echo "[!] The initial username and password for ctfcop are:"
echo "    admin / password"
echo "    Make sure to change passwords upon login."

