import os
from flask import Flask, render_template


import mimetypes
mimetypes.add_type('application/wasm', '.wasm')

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    app.run(debug=debug_mode, port=5500)
