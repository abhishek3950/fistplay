from flask import Flask, render_template
from flask_cors import CORS

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable CORS

# Route to serve your HTML file
@app.route('/')
def index():
    return render_template('modeltest.html')

if __name__ == '__main__':
    app.run(debug=True, port=5001)  # Run the app on port 5001
