const GoogleService = require('./google');
const WhatsAppService = require('./whatsapp');
const OpenAIService = require('./openai');

class CalendarHandler {
  constructor() {
    this.googleService = GoogleService;
    this.whatsappService = WhatsAppService;
    this.openaiService = OpenAIService;
  }

  /**
   * Process incoming WhatsApp message for calendar operations
   */
  async processMessage(businessId, message, from) {
    try {
      // Detect calendar intent
      const intent = this.openaiService.detectCalendarIntent(message);
      
      if (!intent) {
        return null; // Not a calendar-related message
      }

      console.log('Calendar intent detected:', intent);

      // Set WhatsApp configuration for this business
      // Note: You'll need to get the WhatsApp config for this business
      // this.whatsappService.setBusinessConfig(whatsappConfig);

      switch (intent.intent) {
        case 'book_appointment':
          return await this.handleBookingRequest(businessId, intent.extractedData, from);
        
        case 'check_availability':
          return await this.handleAvailabilityCheck(businessId, intent.extractedData, from);
        
        case 'create_reminder':
          return await this.handleReminderRequest(businessId, intent.extractedData, from);
        
        case 'schedule_meeting':
          return await this.handleMeetingRequest(businessId, intent.extractedData, from);
        
        default:
          return await this.whatsappService.sendTextMessage(from, 
            "I understand you want to do something with your calendar, but I'm not sure what exactly. Please try rephrasing your request.");
      }
    } catch (error) {
      console.error('Error processing calendar message:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I encountered an error processing your calendar request. Please try again.');
    }
  }

  /**
   * Handle appointment booking request
   */
  async handleBookingRequest(businessId, data, from) {
    try {
      if (!data.date || !data.time) {
        return await this.whatsappService.sendTextMessage(from, 
          "I need more information to book your appointment. Please specify the date and time. For example: 'Book a haircut tomorrow at 3 PM'");
      }

      // Create start and end times
      const startDateTime = new Date(`${data.date}T${data.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + (data.duration || 60) * 60000);

      // Check availability
      const availability = await this.googleService.checkAvailability(
        businessId, 
        startDateTime.toISOString(), 
        endDateTime.toISOString()
      );

      if (availability.isAvailable) {
        // Create the appointment
        const eventData = {
          title: data.title || 'Appointment',
          description: data.description || '',
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timeZone: 'UTC'
        };

        const event = await this.googleService.createCalendarEvent(businessId, eventData);
        
        return await this.whatsappService.sendAppointmentConfirmation(from, event);
      } else {
        // Suggest alternative times
        const timeSlot = `${data.date} at ${data.time}`;
        return await this.whatsappService.sendAvailabilityResponse(from, availability, timeSlot);
      }
    } catch (error) {
      console.error('Error handling booking request:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I couldn\'t book your appointment. Please try again.');
    }
  }

  /**
   * Handle availability check request
   */
  async handleAvailabilityCheck(businessId, data, from) {
    try {
      if (data.date && data.time) {
        // Check specific time
        const startDateTime = new Date(`${data.date}T${data.time}:00`);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60000);

        const availability = await this.googleService.checkAvailability(
          businessId, 
          startDateTime.toISOString(), 
          endDateTime.toISOString()
        );

        const timeSlot = `${data.date} at ${data.time}`;
        return await this.whatsappService.sendAvailabilityResponse(from, availability, timeSlot);
      } else if (data.date) {
        // Find available slots for the day
        const availableSlots = await this.googleService.findAvailableSlots(businessId, data.date);
        return await this.whatsappService.sendAvailableSlots(from, data.date, availableSlots.availableSlots);
      } else {
        // Find next available slot
        const nextSlot = await this.googleService.getNextAvailableSlot(businessId);
        return await this.whatsappService.sendNextAvailableSlot(from, nextSlot);
      }
    } catch (error) {
      console.error('Error handling availability check:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I couldn\'t check your availability. Please try again.');
    }
  }

  /**
   * Handle reminder request
   */
  async handleReminderRequest(businessId, data, from) {
    try {
      if (!data.title || !data.time) {
        return await this.whatsappService.sendTextMessage(from, 
          "I need more information to set your reminder. Please specify what you want to be reminded about and when. For example: 'Remind me to call supplier at 5 PM'");
      }

      const reminderTime = new Date(`${data.date || new Date().toISOString().split('T')[0]}T${data.time}:00`);

      const reminderData = {
        title: data.title,
        description: data.description || '',
        reminderTime: reminderTime.toISOString(),
        timeZone: 'UTC'
      };

      const reminder = await this.googleService.createReminder(businessId, reminderData);
      
      return await this.whatsappService.sendReminderConfirmation(from, reminder);
    } catch (error) {
      console.error('Error handling reminder request:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I couldn\'t set your reminder. Please try again.');
    }
  }

  /**
   * Handle meeting request
   */
  async handleMeetingRequest(businessId, data, from) {
    try {
      if (!data.date || !data.time) {
        return await this.whatsappService.sendTextMessage(from, 
          "I need more information to schedule your meeting. Please specify the date and time. For example: 'Schedule a meeting with John next Monday at 10 AM'");
      }

      const startDateTime = new Date(`${data.date}T${data.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + (data.duration || 60) * 60000);

      // Check availability first
      const availability = await this.googleService.checkAvailability(
        businessId, 
        startDateTime.toISOString(), 
        endDateTime.toISOString()
      );

      if (!availability.isAvailable) {
        const timeSlot = `${data.date} at ${data.time}`;
        return await this.whatsappService.sendAvailabilityResponse(from, availability, timeSlot);
      }

      // Create meeting event with Google Meet
      const eventData = {
        title: data.title || 'Meeting',
        description: data.description || '',
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        timeZone: 'UTC',
        attendees: data.participants || [],
        location: data.location || ''
      };

      const event = await this.googleService.createMeetingEvent(businessId, eventData);
      
      return await this.whatsappService.sendMeetingConfirmation(from, event, event.meetingLink);
    } catch (error) {
      console.error('Error handling meeting request:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I couldn\'t schedule your meeting. Please try again.');
    }
  }

  /**
   * Handle follow-up responses (YES/NO confirmations)
   */
  async handleFollowUpResponse(businessId, message, from, context) {
    try {
      const lowercaseMessage = message.toLowerCase().trim();
      
      if (lowercaseMessage === 'yes' || lowercaseMessage === 'y') {
        if (context.type === 'availability_confirmation') {
          // Book the appointment that was previously checked
          return await this.handleBookingRequest(businessId, context.data, from);
        } else if (context.type === 'slot_confirmation') {
          // Book the specific slot
          return await this.handleBookingRequest(businessId, context.data, from);
        }
      } else if (lowercaseMessage === 'no' || lowercaseMessage === 'n') {
        return await this.whatsappService.sendTextMessage(from, 
          'No problem! Let me know if you need help with anything else.');
      } else if (lowercaseMessage === 'cancel') {
        // Handle cancellation logic here
        return await this.whatsappService.sendTextMessage(from, 
          'To cancel an appointment, please provide the appointment details or date/time.');
      }
      
      return null; // Not a follow-up response
    } catch (error) {
      console.error('Error handling follow-up response:', error);
      return await this.whatsappService.sendCalendarError(from, 
        'Sorry, I couldn\'t process your response. Please try again.');
    }
  }
}

module.exports = new CalendarHandler(); 