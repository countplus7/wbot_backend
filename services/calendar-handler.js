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
          return {
            success: true,
            message: "I understand you want to do something with your calendar, but I'm not sure what exactly. Please try rephrasing your request."
          };
      }
    } catch (error) {
      console.error('Error processing calendar message:', error);
      return {
        success: false,
        message: 'Sorry, I encountered an error processing your calendar request. Please try again.'
      };
    }
  }

  /**
   * Handle appointment booking request
   */
  async handleBookingRequest(businessId, data, from) {
    try {
      if (!data.date || !data.time) {
        return {
          success: true,
          message: "I need more information to book your appointment. Please specify the date and time. For example: 'Book a haircut tomorrow at 3 PM'"
        };
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
        
        return {
          success: true,
          message: this.formatAppointmentConfirmation(event),
          event: event
        };
      } else {
        // Suggest alternative times
        const timeSlot = `${data.date} at ${data.time}`;
        return {
          success: true,
          message: this.formatAvailabilityResponse(availability, timeSlot),
          availability: availability
        };
      }
    } catch (error) {
      console.error('Error handling booking request:', error);
      return {
        success: false,
        message: 'Sorry, I couldn\'t book your appointment. Please try again.'
      };
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
        return {
          success: true,
          message: this.formatAvailabilityResponse(availability, timeSlot),
          availability: availability
        };
      } else if (data.date) {
        // Find available slots for the day
        const availableSlots = await this.googleService.findAvailableSlots(businessId, data.date);
        return {
          success: true,
          message: this.formatAvailableSlots(data.date, availableSlots.availableSlots),
          slots: availableSlots
        };
      } else {
        // Find next available slot
        const nextSlot = await this.googleService.getNextAvailableSlot(businessId);
        return {
          success: true,
          message: this.formatNextAvailableSlot(nextSlot),
          nextSlot: nextSlot
        };
      }
    } catch (error) {
      console.error('Error handling availability check:', error);
      return {
        success: false,
        message: 'Sorry, I couldn\'t check your availability. Please try again.'
      };
    }
  }

  /**
   * Handle reminder request
   */
  async handleReminderRequest(businessId, data, from) {
    try {
      if (!data.title || !data.time) {
        return {
          success: true,
          message: "I need more information to set your reminder. Please specify what you want to be reminded about and when. For example: 'Remind me to call supplier at 5 PM'"
        };
      }

      const reminderTime = new Date(`${data.date || new Date().toISOString().split('T')[0]}T${data.time}:00`);

      const reminderData = {
        title: data.title,
        description: data.description || '',
        reminderTime: reminderTime.toISOString(),
        timeZone: 'UTC'
      };

      const reminder = await this.googleService.createReminder(businessId, reminderData);
      
      return {
        success: true,
        message: this.formatReminderConfirmation(reminder),
        reminder: reminder
      };
    } catch (error) {
      console.error('Error handling reminder request:', error);
      return {
        success: false,
        message: 'Sorry, I couldn\'t set your reminder. Please try again.'
      };
    }
  }

  /**
   * Handle meeting request
   */
  async handleMeetingRequest(businessId, data, from) {
    try {
      if (!data.date || !data.time) {
        return {
          success: true,
          message: "I need more information to schedule your meeting. Please specify the date and time. For example: 'Schedule a meeting with John next Monday at 10 AM'"
        };
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
        return {
          success: true,
          message: this.formatAvailabilityResponse(availability, timeSlot),
          availability: availability
        };
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
      
      return {
        success: true,
        message: this.formatMeetingConfirmation(event, event.meetingLink),
        event: event
      };
    } catch (error) {
      console.error('Error handling meeting request:', error);
      return {
        success: false,
        message: 'Sorry, I couldn\'t schedule your meeting. Please try again.'
      };
    }
  }

  // Helper methods to format responses
  formatAppointmentConfirmation(event) {
    const startTime = new Date(event.start.dateTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let message = `✅ Appointment Confirmed!\n\n`;
    message += `📅 Date & Time: ${startTime}\n`;
    message += `📝 Title: ${event.summary}\n`;
    
    if (event.description) {
      message += `📋 Description: ${event.description}\n`;
    }
    
    if (event.location) {
      message += `📍 Location: ${event.location}\n`;
    }

    message += `\n⏰ You'll receive a reminder 30 minutes before your appointment.`;
    message += `\n\nReply "CANCEL" if you need to reschedule or cancel.`;

    return message;
  }

  formatAvailabilityResponse(availability, timeSlot) {
    if (availability.isAvailable) {
      return `✅ Great! I'm available ${timeSlot}.\n\nWould you like to book this appointment? Reply "YES" to confirm or "NO" to cancel.`;
    } else {
      const conflicts = availability.conflictingEvents.length;
      return `❌ Sorry, I'm not available ${timeSlot}.\n\nI have ${conflicts} conflicting appointment${conflicts > 1 ? 's' : ''} at that time.\n\nWould you like me to suggest alternative times? Reply "YES" for suggestions.`;
    }
  }

  formatAvailableSlots(date, availableSlots) {
    if (availableSlots.length === 0) {
      return `❌ No available slots found for ${date}.\n\nWould you like me to check another date?`;
    }

    let message = ` Available time slots for ${date}:\n\n`;
    
    availableSlots.slice(0, 5).forEach((slot, index) => {
      const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const endTime = new Date(slot.end).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      message += `${index + 1}. ${startTime} - ${endTime}\n`;
    });

    if (availableSlots.length > 5) {
      message += `\n... and ${availableSlots.length - 5} more slots available.\n`;
    }

    message += `\nReply with the number (1-${Math.min(availableSlots.length, 5)}) to book that slot, or "MORE" to see additional times.`;

    return message;
  }

  formatNextAvailableSlot(nextSlot) {
    if (!nextSlot.nextSlot) {
      return `❌ ${nextSlot.message || 'No available slots found in the next 30 days.'}`;
    }

    const { date, nextSlot: slot } = nextSlot;
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const endTime = new Date(slot.end).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let message = `📅 Next Available Appointment:\n\n`;
    message += `📅 Date: ${formattedDate}\n`;
    message += `⏰ Time: ${startTime} - ${endTime}\n`;
    message += `⏱️ Duration: ${slot.duration} minutes\n\n`;
    message += `Would you like to book this slot? Reply "YES" to confirm.`;

    return message;
  }

  formatReminderConfirmation(reminder) {
    const reminderTime = new Date(reminder.start.dateTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let message = `✅ Reminder Set!\n\n`;
    message += ` Title: ${reminder.summary}\n`;
    message += `⏰ Time: ${reminderTime}\n`;
    
    if (reminder.description) {
      message += ` Details: ${reminder.description}\n`;
    }

    message += `\nYou'll receive a notification at the scheduled time.`;
    message += `\n\nReply "CANCEL" if you need to remove this reminder.`;

    return message;
  }

  formatMeetingConfirmation(event, meetingLink) {
    const startTime = new Date(event.start.dateTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let message = `✅ Meeting Scheduled!\n\n`;
    message += `📅 Date & Time: ${startTime}\n`;
    message += `📝 Title: ${event.summary}\n`;
    
    if (event.description) {
      message += ` Description: ${event.description}\n`;
    }

    if (meetingLink) {
      message += `🔗 Google Meet Link: ${meetingLink}\n`;
    }

    if (event.attendees && event.attendees.length > 0) {
      message += ` Attendees: ${event.attendees.map(a => a.email).join(', ')}\n`;
    }

    message += `\n⏰ You'll receive a reminder 10 minutes before the meeting.`;
    message += `\n\nReply "CANCEL" if you need to reschedule or cancel.`;

    return message;
  }
}

module.exports = new CalendarHandler(); 