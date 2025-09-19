const GoogleService = require("./google");
const OpenAIService = require("./openai");

class CalendarHandler {
  constructor() {
    this.googleService = GoogleService;
    this.openaiService = OpenAIService;
    this.conversationContext = new Map();

    // CHANGE THIS TO YOUR BUSINESS TIMEZONE
    this.defaultTimezone = "America/New_York"; // Change this to your actual timezone
  }

  /**
   * Get timezone for a business (you can make this configurable)
   */
  getBusinessTimezone(businessId) {
    // For now, return default timezone
    // You can later make this configurable per business
    return this.defaultTimezone;
  }

  /**
   * Process incoming WhatsApp message for calendar operations
   */
  async processMessage(businessId, message, from) {
    try {
      // First check for CANCEL command
      const cancelResult = await this.handleCancelCommand(businessId, message, from);
      if (cancelResult) {
        return cancelResult;
      }

      // Then check if this is a follow-up response (YES/NO)
      const followUpResult = await this.handleFollowUpResponse(businessId, message, from);
      if (followUpResult) {
        return followUpResult;
      }

      // Detect calendar intent
      const intent = this.openaiService.detectCalendarIntent(message);

      if (!intent) {
        return null; // Not a calendar-related message
      }

      console.log("Calendar intent detected:", intent);

      switch (intent.intent) {
        case "book_appointment":
          return await this.handleBookingRequest(businessId, intent.extractedData, from);

        case "check_availability":
          return await this.handleAvailabilityCheck(businessId, intent.extractedData, from);

        case "create_reminder":
          return await this.handleReminderRequest(businessId, intent.extractedData, from);

        case "schedule_meeting":
          return await this.handleMeetingRequest(businessId, intent.extractedData, from);

        default:
          return {
            success: true,
            message:
              "I understand you want to do something with your calendar, but I'm not sure what exactly. Please try rephrasing your request.",
          };
      }
    } catch (error) {
      console.error("Error processing calendar message:", error);
      return {
        success: false,
        message: "Sorry, I encountered an error processing your calendar request. Please try again.",
      };
    }
  }

  /**
   * Handle CANCEL command
   */
  async handleCancelCommand(businessId, message, from) {
    try {
      const lowercaseMessage = message.toLowerCase().trim();

      if (lowercaseMessage === "cancel" || lowercaseMessage === "cancelled") {
        // Get the last calendar context to find the appointment to cancel
        const context = this.getContext(businessId, from);

        if (context && context.eventId) {
          // Cancel the specific appointment
          try {
            await this.googleService.deleteCalendarEvent(businessId, context.eventId);
            this.clearContext(businessId, from);

            return {
              success: true,
              message: "✅ Appointment cancelled successfully! Your appointment has been removed from the calendar.",
            };
          } catch (error) {
            console.error("Error cancelling appointment:", error);
            return {
              success: false,
              message: "Sorry, I couldn't cancel your appointment. Please try again or contact support.",
            };
          }
        } else {
          // No specific appointment to cancel
          this.clearContext(businessId, from);
          return {
            success: true,
            message:
              "No active appointment to cancel. If you need to cancel a specific appointment, please provide the date and time.",
          };
        }
      }

      return null; // Not a cancel command
    } catch (error) {
      console.error("Error handling cancel command:", error);
      return null;
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
          message:
            "I need more information to book your appointment. Please specify the date and time. For example: 'Book a haircut tomorrow at 3 PM'",
        };
      }

      // Get business timezone
      const timezone = this.getBusinessTimezone(businessId);

      // Create start and end times with proper timezone handling
      const startDateTime = new Date(`${data.date}T${data.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + (data.duration || 60) * 60000);

      console.log("Creating appointment:", {
        date: data.date,
        time: data.time,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        timezone: timezone,
      });

      // Check availability
      const availability = await this.googleService.checkAvailability(
        businessId,
        startDateTime.toISOString(),
        endDateTime.toISOString()
      );

      if (availability.isAvailable) {
        // Create the appointment with proper timezone
        const eventData = {
          title: data.title || "Appointment",
          description: data.description || "",
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timeZone: timezone,
        };

        const event = await this.googleService.createCalendarEvent(businessId, eventData);

        // Store the event ID in context for potential cancellation
        this.storeContext(businessId, from, {
          type: "appointment_created",
          eventId: event.id,
          event: event,
        });

        return {
          success: true,
          message: this.formatAppointmentConfirmation(event, timezone),
          event: event,
        };
      } else {
        // Suggest alternative times
        const timeSlot = `${data.date} at ${data.time}`;
        return {
          success: true,
          message: this.formatAvailabilityResponse(availability, timeSlot),
          availability: availability,
        };
      }
    } catch (error) {
      console.error("Error handling booking request:", error);
      return {
        success: false,
        message: "Sorry, I couldn't book your appointment. Please try again.",
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

        // Store context for follow-up
        this.storeContext(businessId, from, {
          type: "availability_check",
          data: data,
          availability: availability,
          timeSlot: timeSlot,
        });

        return {
          success: true,
          message: this.formatAvailabilityResponse(availability, timeSlot),
          availability: availability,
        };
      } else if (data.date) {
        // Find available slots for the day
        const availableSlots = await this.googleService.findAvailableSlots(businessId, data.date);
        return {
          success: true,
          message: this.formatAvailableSlots(data.date, availableSlots.availableSlots),
          slots: availableSlots,
        };
      } else {
        // Find next available slot
        const nextSlot = await this.googleService.getNextAvailableSlot(businessId);
        return {
          success: true,
          message: this.formatNextAvailableSlot(nextSlot),
          nextSlot: nextSlot,
        };
      }
    } catch (error) {
      console.error("Error handling availability check:", error);
      return {
        success: false,
        message: "Sorry, I couldn't check your availability. Please try again.",
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
          message:
            "I need more information to set your reminder. Please specify what you want to be reminded about and when. For example: 'Remind me to call supplier at 5 PM'",
        };
      }

      const reminderTime = new Date(`${data.date || new Date().toISOString().split("T")[0]}T${data.time}:00`);

      const reminderData = {
        title: data.title,
        description: data.description || "",
        reminderTime: reminderTime.toISOString(),
        timeZone: this.getBusinessTimezone(businessId),
      };

      const reminder = await this.googleService.createReminder(businessId, reminderData);

      return {
        success: true,
        message: this.formatReminderConfirmation(reminder),
        reminder: reminder,
      };
    } catch (error) {
      console.error("Error handling reminder request:", error);
      return {
        success: false,
        message: "Sorry, I couldn't set your reminder. Please try again.",
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
          message:
            "I need more information to schedule your meeting. Please specify the date and time. For example: 'Schedule a meeting with John next Monday at 10 AM'",
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
          availability: availability,
        };
      }

      // Create meeting event with Google Meet
      const eventData = {
        title: data.title || "Meeting",
        description: data.description || "",
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        timeZone: this.getBusinessTimezone(businessId),
        attendees: data.participants || [],
        location: data.location || "",
      };

      const event = await this.googleService.createMeetingEvent(businessId, eventData);

      return {
        success: true,
        message: this.formatMeetingConfirmation(event, event.meetingLink),
        event: event,
      };
    } catch (error) {
      console.error("Error handling meeting request:", error);
      return {
        success: false,
        message: "Sorry, I couldn't schedule your meeting. Please try again.",
      };
    }
  }

  /**
   * Store conversation context
   */
  storeContext(businessId, from, context) {
    const key = `${businessId}_${from}`;
    this.conversationContext.set(key, {
      ...context,
      timestamp: Date.now(),
    });
  }

  /**
   * Get conversation context
   */
  getContext(businessId, from) {
    const key = `${businessId}_${from}`;
    const context = this.conversationContext.get(key);

    // Remove context if it's older than 10 minutes
    if (context && Date.now() - context.timestamp > 10 * 60 * 1000) {
      this.conversationContext.delete(key);
      return null;
    }

    return context;
  }

  /**
   * Clear conversation context
   */
  clearContext(businessId, from) {
    const key = `${businessId}_${from}`;
    this.conversationContext.delete(key);
  }

  /**
   * Handle follow-up responses (YES/NO confirmations)
   */
  async handleFollowUpResponse(businessId, message, from) {
    try {
      const lowercaseMessage = message.toLowerCase().trim();
      const context = this.getContext(businessId, from);

      if (!context) {
        return null; // No context found
      }

      if (lowercaseMessage === "yes" || lowercaseMessage === "y") {
        if (context.type === "availability_check" && context.availability.isAvailable) {
          // Book the appointment that was previously checked
          this.clearContext(businessId, from);
          return await this.handleBookingRequest(businessId, context.data, from);
        }
      } else if (lowercaseMessage === "no" || lowercaseMessage === "n") {
        this.clearContext(businessId, from);
        return {
          success: true,
          message: "No problem! Let me know if you need help with anything else.",
        };
      }

      return null; // Not a follow-up response
    } catch (error) {
      console.error("Error handling follow-up response:", error);
      return null;
    }
  }

  /**
   * Format appointment confirmation with proper timezone
   */
  formatAppointmentConfirmation(event, timezone = "America/New_York") {
    // Use the event's actual start time and convert to the business timezone
    const startTime = new Date(event.start.dateTime).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
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
      // Format the timeSlot to be more user-friendly
      const formattedTimeSlot = this.formatTimeSlot(timeSlot);
      return `✅ Great! I'm available ${formattedTimeSlot}.\n\nWould you like to book this appointment? Reply "YES" to confirm or "NO" to cancel.`;
    } else {
      const conflicts = availability.conflictingEvents.length;
      const formattedTimeSlot = this.formatTimeSlot(timeSlot);
      return `❌ Sorry, I'm not available ${formattedTimeSlot}.\n\nI have ${conflicts} conflicting appointment${
        conflicts > 1 ? "s" : ""
      } at that time.\n\nWould you like me to suggest alternative times? Reply "YES" for suggestions.`;
    }
  }

  formatTimeSlot(timeSlot) {
    // timeSlot format: "2025-09-19 at 14:00"
    const [datePart, timePart] = timeSlot.split(" at ");
    const date = new Date(datePart);
    const time = timePart;

    // Convert to user-friendly format
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });

    // Convert 24-hour time to 12-hour format
    const [hours, minutes] = time.split(":");
    const hour12 = parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
    const period = parseInt(hours) >= 12 ? "PM" : "AM";
    const formattedTime = `${hour12}:${minutes} ${period}`;

    return `${dayName} (${formattedDate}) at ${formattedTime}`;
  }

  formatAvailableSlots(date, availableSlots) {
    if (availableSlots.length === 0) {
      return `❌ No available slots found for ${date}.\n\nWould you like me to check another date?`;
    }

    let message = ` Available time slots for ${date}:\n\n`;

    availableSlots.slice(0, 5).forEach((slot, index) => {
      const startTime = new Date(slot.start).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const endTime = new Date(slot.end).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      message += `${index + 1}. ${startTime} - ${endTime}\n`;
    });

    if (availableSlots.length > 5) {
      message += `\n... and ${availableSlots.length - 5} more slots available.\n`;
    }

    message += `\nReply with the number (1-${Math.min(
      availableSlots.length,
      5
    )}) to book that slot, or "MORE" to see additional times.`;

    return message;
  }

  formatNextAvailableSlot(nextSlot) {
    if (!nextSlot.nextSlot) {
      return `❌ ${nextSlot.message || "No available slots found in the next 30 days."}`;
    }

    const { date, nextSlot: slot } = nextSlot;
    const formattedDate = new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const startTime = new Date(slot.start).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const endTime = new Date(slot.end).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let message = `📅 Next Available Appointment:\n\n`;
    message += `📅 Date: ${formattedDate}\n`;
    message += `⏰ Time: ${startTime} - ${endTime}\n`;
    message += `⏱️ Duration: ${slot.duration} minutes\n\n`;
    message += `Would you like to book this slot? Reply "YES" to confirm.`;

    return message;
  }

  formatReminderConfirmation(reminder) {
    const reminderTime = new Date(reminder.start.dateTime).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let message = `✅ Reminder Set!\n\n`;
    message += `📝 Title: ${reminder.summary}\n`;
    message += `⏰ Time: ${reminderTime}\n`;

    if (reminder.description) {
      message += `📋 Details: ${reminder.description}\n`;
    }

    message += `\nYou'll receive a notification at the scheduled time.`;
    message += `\n\nReply "CANCEL" if you need to remove this reminder.`;

    return message;
  }

  formatMeetingConfirmation(event, meetingLink) {
    const startTime = new Date(event.start.dateTime).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let message = `✅ Meeting Scheduled!\n\n`;
    message += `📅 Date & Time: ${startTime}\n`;
    message += `📝 Title: ${event.summary}\n`;

    if (event.description) {
      message += `📋 Description: ${event.description}\n`;
    }

    if (meetingLink) {
      message += `🔗 Google Meet Link: ${meetingLink}\n`;
    }

    if (event.attendees && event.attendees.length > 0) {
      message += `📧 Attendees: ${event.attendees.map((a) => a.email).join(", ")}\n`;
    }

    message += `\n⏰ You'll receive a reminder 10 minutes before the meeting.`;
    message += `\n\nReply "CANCEL" if you need to reschedule or cancel.`;

    return message;
  }
}

module.exports = new CalendarHandler();
