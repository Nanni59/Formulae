from flask import Flask, render_template


import mimetypes
mimetypes.add_type('application/wasm', '.wasm')

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
