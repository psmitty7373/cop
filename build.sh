echo 'Building main...'
#browserify public/js/main.js -i popper.js --standalone main > public/js/main-bundle.js
echo 'Building config...'
#browserify public/js/config.js -i popper.js --standalone config > public/js/config-bundle.js
echo 'Building cop...'
browserify public/js/cop.js -i popper.js -i jsdom -i jsdom/lib/jsdom/utils -i jsdom/lib/jsdom/living/generated/utils -i canvas -i xmldom --standalone cop | browser-unpack | browser-pack-flat > public/js/cop-bundle.js
