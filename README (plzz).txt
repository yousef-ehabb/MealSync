====================================================
   AU Dorm Meal Booking System 
====================================================

INSTALLATION INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Install Node.js
   • Download from: https://nodejs.org
   • Install the LTS version
   • Restart your computer after installation

STEP 2: Run Setup
   • Double-click 'setup.bat'
   • Wait for installation to complete

STEP 3: Test the Application
   • Double-click 'run.bat'
   • Enter your Student ID and Password
   • The app will book your meals automatically

====================================================

AUTOMATIC SCHEDULING (Every 3 Days):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Press Windows Key + R
2. Type: taskschd.msc
3. Press Enter

4. Click "Create Basic Task"

5. Fill in:
   • Name: Meal Booking Auto
   • Description: Auto book meals every 3 days
   • Click Next

6. Trigger:
   • Select: Daily
   • Click Next

7. Daily Settings:
   • Start: Choose time (e.g., 8:00 AM)
   • Recur every: 3 days
   • Click Next

8. Action:
   • Select: Start a program
   • Click Next

9. Start a Program:
   • Program/script: Browse and select 'run.bat'
   • Start in: Copy the full path of this folder
     Example: C:\Users\YourName\meal-booking
   • Click Next

10. Finish:
    • Check "Open the Properties dialog"
    • Click Finish

11. In Properties:
    • Conditions tab → Check "Wake the computer"
    • Settings tab → Check "Run as soon as possible"
    • Click OK

Done! The app will now run every 3 days automatically.

====================================================

TROUBLESHOOTING:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Problem: "Node.js not installed" error
Solution: Install Node.js and restart computer

Problem: Want to change credentials
Solution: Delete 'credentials.json' and run 'run.bat'

===================================================

DEVELOPER INFORMATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This application was developed with ❤️ by:

   Name:    Yousef Ehab Khalaf
   Contact: yousef.ehab.k@gmail.com

Special thanks to everyone using this application!
If you found this helpful:
- ⭐ Share it with your friends
- 💬 Send feedback and suggestions
- 🐛 Report any bugs you find

Version: 1.0.0
Year: 2025

© 2025 Yousef Ehab. All rights reserved.

====================================================