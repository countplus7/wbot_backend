require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.model = 'gpt-4';
    this.visionModel = 'gpt-4o'; // Updated from deprecated gpt-4-vision-preview
  }

  async chatCompletion(messages, conversationHistory = [], businessTone = null) {
    try {
      let systemContent = `You are a helpful AI assistant integrated with WhatsApp. 
      Be conversational, friendly, and helpful. Keep responses concise but informative.
      If you're analyzing images, describe what you see clearly and provide relevant insights.`;

      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        systemContent += `\n\n${businessTone.tone_instructions}`;
      }

      const systemMessage = {
        role: 'system',
        content: systemContent
      };

      const allMessages = [systemMessage, ...conversationHistory, ...messages];

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: allMessages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI chat completion error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  async analyzeImage(imagePath, userMessage = '', businessTone = null) {
    try {
      console.log(`OpenAI: Analyzing image at path: ${imagePath}`);
      
      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        console.error(`OpenAI: Image file not found: ${imagePath}`);
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log(`OpenAI: Image file size: ${imageBuffer.length} bytes`);
      console.log(`OpenAI: Base64 length: ${base64Image.length} characters`);

      let promptText = 'Please analyze this image and describe what you see in detail. Include any text, objects, people, colors, or important details. Be specific and helpful in your description.';
      
      // If user sent a message with the image, include it in the analysis
      if (userMessage && userMessage.trim() !== '' && userMessage !== 'User sent a image message') {
        promptText += ` The user also sent this message with the image: "${userMessage}". Please consider this context in your analysis.`;
      }
      
      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        promptText += `\n\n${businessTone.tone_instructions}`;
      }

      console.log(`OpenAI: Using prompt: ${promptText}`);

      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ];

      console.log(`OpenAI: Sending request to OpenAI with model: ${this.visionModel}`);

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
      });

      console.log(`OpenAI: Received response: ${response.choices[0].message.content}`);
      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI image analysis error:', error);
      console.error('OpenAI error details:', error.message);
      console.error('OpenAI error stack:', error.stack);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  async transcribeAudio(audioPath) {
    try {
      // Check if file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const audioFile = fs.createReadStream(audioPath);
      
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'text',
        language: 'en',
        temperature: 0.2, // Lower temperature for more accurate transcription
      });

      return response;
    } catch (error) {
      console.error('OpenAI transcription error:', error);
      throw error;
    }
  }

  async processMessage(messageType, content, filePath = null, conversationHistory = [], businessTone = null) {
    try {
      console.log(`OpenAI: Processing message type: ${messageType}`);
      console.log(`OpenAI: Content: ${content}`);
      console.log(`OpenAI: File path: ${filePath}`);
      console.log(`OpenAI: File exists: ${filePath ? fs.existsSync(filePath) : 'N/A'}`);
      
      let aiResponse = '';

      switch (messageType) {
        case 'text':
          console.log('OpenAI: Processing text message');
          aiResponse = await this.chatCompletion([
            { role: 'user', content: content }
          ], conversationHistory, businessTone);
          break;

        case 'image':
          console.log('OpenAI: Processing image message');
          if (!filePath) {
            console.error('OpenAI: Image file path is required for image analysis');
            throw new Error('Image file path is required for image analysis');
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Image file does not exist: ${filePath}`);
            throw new Error(`Image file does not exist: ${filePath}`);
          }
          // For images, analyze directly and provide a conversational response
          const imageAnalysis = await this.analyzeImage(filePath, content, businessTone);
          
          // If there's user text with the image, combine it with the analysis
          if (content && content.trim() !== '' && content !== `User sent a ${messageType} message`) {
            aiResponse = await this.chatCompletion([
              { role: 'user', content: `User sent an image with this message: "${content}". Here's what I see in the image: ${imageAnalysis}. Please respond to both the image and the user's message.` }
            ], conversationHistory, businessTone);
          } else {
            // Just respond to the image analysis
            aiResponse = await this.chatCompletion([
              { role: 'user', content: `I analyzed this image and here's what I see: ${imageAnalysis}. Please provide a helpful response about what's in the image.` }
            ], conversationHistory, businessTone);
          }
          break;

        case 'audio':
          console.log('OpenAI: Processing audio message');
          if (!filePath) {
            console.error('OpenAI: Audio file path is required for transcription');
            throw new Error('Audio file path is required for transcription');
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Audio file does not exist: ${filePath}`);
            throw new Error(`Audio file does not exist: ${filePath}`);
          }
          const transcription = await this.transcribeAudio(filePath);
          aiResponse = await this.chatCompletion([
            { role: 'user', content: `Transcribed audio: "${transcription}". Please respond to this message naturally and conversationally.` }
          ], conversationHistory, businessTone);
          break;

        default:
          console.error(`OpenAI: Unsupported message type: ${messageType}`);
          throw new Error(`Unsupported message type: ${messageType}`);
      }

      console.log(`OpenAI: Generated response: ${aiResponse}`);
      return aiResponse;
    } catch (error) {
      console.error('OpenAI: Error processing message:', error);
      console.error('OpenAI: Error details:', error.message);
      console.error('OpenAI: Error stack:', error.stack);
      throw error;
    }
  }
}

module.exports = new OpenAIService(); 