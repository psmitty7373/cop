#!/bin/sh
service mongodb start
sleep 6 # Ugly solution to give mongodb time to start before running the node app
service mysql start
# wait for mysql server to start (max 30 seconds)
timeout=30
echo -n "Waiting for database server to accept connections"
while ! /usr/bin/mysqladmin -u root status >/dev/null 2>&1
do
  timeout=$(($timeout - 1))
  if [ $timeout -eq 0 ]; then
    echo -e "\nCould not connect to database server. Aborting..."
    exit 1
  fi
  echo -n "."
  sleep 1
done
echo
echo "Please provide your mysql root password.  This is used to"
echo "create the MCSCOP database."
mysql -u root -e "CREATE DATABASE mcscop;" 2>&1
echo "Please provide your mysql root password.  This is used to"
echo "create the MCSCOP schema."
cat mysql/mcscop-schema.sql mysql/user.sql | mysql -u root -p mcscop
/usr/bin/node /home/mcscop/app.js
