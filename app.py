from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import base64

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)  # Enable CORS

# Load your TensorFlow model for predictions
#model = tf.keras.models.load_model('model/rps_model.h5')

# Print the expected input shape
#print("Model input shape:", model.input_shape)

# Route to serve your HTML file
@app.route('/')
def index():
    return render_template('modeltest.html')

# Helper function to process image
def preprocess_image(image_data):
    try:
        # Remove the image header if present (e.g., "data:image/jpeg;base64,")
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]

        # Decode the base64 image data
        image = Image.open(io.BytesIO(base64.b64decode(image_data)))

        # Resize the image to the expected input size of the model (150x150)
        image = image.resize((150, 150))

        # Convert to RGB if the image is not in RGB format
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Convert the image to a numpy array
        image = np.array(image)

        # Reshape the image to match the model's input (1, 150, 150, 3)
        image = np.expand_dims(image, axis=0)
        
        return image
    except Exception as e:
        print(f"Error in preprocessing image: {e}")
        return None

# Prediction API
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()

        # Get the image data from the request and preprocess it
        frame_data = data['frame_data']  # This should be base64 encoded image data
        image = preprocess_image(frame_data)

        if image is None:
            return jsonify({"error": "Invalid image data"}), 400

        # Make the prediction
        prediction = model.predict(image)

        # Assuming you have 3 classes: rock, paper, scissors, map the result
        class_index = np.argmax(prediction[0])
        class_names = ['rock', 'paper', 'scissors']
        predicted_class = class_names[class_index]

        # Send back the prediction as JSON
        result = {"prediction": predicted_class}
        return jsonify(result)

    except Exception as e:
        # Log the error and return a response
        print("Error occurred:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)  # Run the app on port 5001
