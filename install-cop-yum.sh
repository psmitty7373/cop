#!/bin/sh
if [ $EUID -ne 0 ] || [ "$SUDO_USER" == "root" ]; then
   echo "[!] This script must be run with sudo."
   exit 1
fi
#!/bin/sh
echo "[*] This script installs the required packages to run cop"
echo "    The following packages will be installed: curl, mysql-server,"
echo "    mysql-client, mongodb, nodejs, and npm."
echo "    You may be prompted to provide your sudo password."
echo ""
echo "[*] Installing to /opt/cop."
echo ""

mkdir /opt/cop
mkdir /opt/cop/mission_files
mkdir /opt/cop/temp_uploads
cp -r * /opt/cop/
groupadd cop
useradd cop -s /bin/false -m -g cop -G cop

while true; do
    read -p "[!] Do you need to install or update packages and dependicies? " yn
    case $yn in
        [Yy]* ) ans=1; break;;
        [Nn]* ) ans=0; break;;
        * ) echo "[!] Please select yes or no.";;
    esac
done
if [ $ans -eq 1 ]; then
    cp mongodb-org-4.2.repo /etc/yum.repos.d
    yum -y install gnupg curl mongodb-org
    curl -sL https://rpm.nodesource.com/setup_10.x | bash -
    yum -y install nodejs
    systemctl enable mongod.service
    systemctl start mongod.service
    chown -R cop.cop /opt/cop
    cd /opt/cop
    sudo -u cop npm install
    chown -R root.root /opt/cop
    chown cop.cop /opt/cop/mission_files
    sudo chown cop.cop /opt/cop/temp_uploads

fi
echo ""
echo "[*] Creating initial admin.  Please provide a password for the"
echo "    default admin user."
echo ""
while true; do
    read -s -p "Password: " pass
    echo ""
    read -s -p "Confirm password: " cpass
    echo ""
    if [ $pass == $cpass ]; then
        cd /opt/cop
        node support.js $pass
        break;
    fi
    echo "[!] Passwords do not match, please try again."
done
echo ""
while true; do
    read -p "[!] Do you want to enable systemd for the cop? " yn
    case $yn in
        [Yy]* ) ans=1; break;;
        [Nn]* ) ans=0; break;;
        * ) echo "[!] Please select yes or no.";;
    esac
done
if [ $ans -eq 1 ]; then
    sudo cp cop.service /lib/systemd/system/cop.service
    sudo systemctl daemon-reload
    sudo systemctl start cop
else
    echo "[!] To run cop use: node app.js from the cop directory."
    echo "    Persistent install is possible using systemd."
fi
echo ""
echo "[!] Install completed. Connect to http://<ip>:3000 to login."
echo ""
