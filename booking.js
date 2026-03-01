import { chromium } from 'playwright';
import { getCredentials, resetCredentials } from './credentials.js';

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\rClosing in ${i} seconds... (Press Enter to close now)`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
}

async function validateLogin(studentId, password) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://al-zahraa.mans.edu.eg/studentLogin');
    await page.locator('input[name="txtStudentID"]').fill(studentId);
    await page.locator('input[name="txtStudentPassword"]').fill(password);
    await page.getByRole('button', { name: 'دخول' }).click();
    
    await page.waitForLoadState('networkidle', { timeout: 10000 });
   
    const mealsMenuExists = await page.locator("//span[contains(text(),'الوجبـــــات')]").count() > 0;
    
    return mealsMenuExists; 
    
  } catch (error) {
    return false;
  } finally {
    await browser.close();
  }
}

async function bookAllMeals() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Keep trying to get valid credentials
    let loggedIn = false;
    let studentId, password;
    
    while (!loggedIn) {
      const credentials = await getCredentials(validateLogin);
      studentId = credentials.studentId;
      password = credentials.password;
      
      console.log('🔄 Logging in...');
      await page.goto('https://al-zahraa.mans.edu.eg/studentLogin');
      await page.locator('input[name="txtStudentID"]').fill(studentId);
      await page.locator('input[name="txtStudentPassword"]').fill(password);
      await page.getByRole('button', { name: 'دخول' }).click();
      
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        
        // Check if login was successful
        const currentUrl = page.url();
        const mealsMenuExists = await page.locator("//span[contains(text(),'الوجبـــــات')]").count() > 0;
        
        if (!currentUrl.includes('studentLogin') && mealsMenuExists) {
          loggedIn = true;
          console.log('✅ Successfully logged in');
        } else {
          console.log('❌ Login failed! Invalid credentials.');
          console.log('🔄 Deleting saved credentials...\n');
          await resetCredentials();
          // Loop will continue and ask for credentials again
        }
      } catch (error) {
        console.log('❌ Login failed! Please try again.\n');
        await resetCredentials();
        // Loop will continue
      }
    }
    
    console.log('🔄 Opening meals page...');
    
    await page.locator("(//span[contains(text(),'الوجبـــــات')])[1]").click();
    await page.waitForSelector("a#getMeals span", { timeout: 5000 });
    await page.locator("a#getMeals span").click();
    await page.waitForTimeout(2000);
    
    console.log('🔄 Checking available meals...\n');
    
    const checkboxes = await page.locator('input[name="chkMeals"]').all();
    let bookedCount = 0;
    let alreadyBookedCount = 0;
    const alreadyBookedDates = [];
    const newlyBookedDates = [];
    
    // التحقق من الوجبات وحجز المتاحة
    for (const checkbox of checkboxes) {
      try {
        const isChecked = await checkbox.isChecked();
        const value = await checkbox.getAttribute('value');
        const date = value?.split('|')[0]; // استخراج التاريخ
        
        if (isChecked) {
          alreadyBookedCount++;
          alreadyBookedDates.push(date);
          console.log(`⏭️  ${date} - Already booked`);
        } else {
          await checkbox.click();
          bookedCount++;
          newlyBookedDates.push(date);
          console.log(`✅ ${date} - Booked successfully`);
          await page.waitForTimeout(200);
        }
      } catch (error) {
        console.log(`⚠️  Error processing meal`);
      }
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Booking Summary:');
    console.log('═'.repeat(50));
    console.log(`📋 Total available meals: ${checkboxes.length}`);
    console.log(`✅ Newly booked meals: ${bookedCount}`);
    console.log(`⏭️  Already booked meals: ${alreadyBookedCount}`);
    
    if (newlyBookedDates.length > 0) {
      console.log('\n🆕 Newly booked dates:');
      newlyBookedDates.forEach(date => console.log(`   • ${date}`));
    }
    
    if (alreadyBookedDates.length > 0) {
      console.log('\n📅 Previously booked dates:');
      alreadyBookedDates.forEach(date => console.log(`   • ${date}`));
    }
    
    console.log('═'.repeat(50) + '\n');
    
    // لو في وجبات جديدة اتحجزت، احفظ
    if (bookedCount > 0) {
      console.log('💾 Saving new bookings...');
      
      try {
        await page.getByRole('button', { name: 'حفظ' }).click({ timeout: 5000 }); 
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Ok' }).click({ timeout: 5000 });
        console.log('✅ Bookings saved successfully! 🎉\n');
      } catch (error) {
        console.log('⚠️  Could not find save button (this is normal if no changes were made)\n');
      }
    } else {
      console.log('ℹ️  No new meals to book. All available meals are already booked! ✨\n');
    }
    
  } catch (error) {
    console.error('❌ An error occurred:', error.message);
    
    // If login failed with saved credentials, delete them
    if (error.message.includes('login') || error.message.includes('credentials')) {
      console.log('🔄 Deleting invalid saved credentials...');
      await resetCredentials();
    }
    
    await page.screenshot({ path: `error-${Date.now()}.png` });
    throw error;
  } finally {
    await browser.close();
  }
}

function displayGreeting() {
  console.clear();
  console.log('╔═════════════════════════════════════════════════╗');
  console.log('║                                                 ║');
  console.log('║       🎓 AU Dorm Meal Booking System            ║');
  console.log('║                                                 ║');
  console.log('║          💻 Proudly Developed by:               ║');
  console.log('║                ⭐ Yousef Ehab                   ║');
  console.log('║                                                 ║');
  console.log('║              📌 Version 1.0.0                   ║');
  console.log('║                                                 ║');
  console.log('║    Please remember my mother in your prayers.   ║');
  console.log('║                                                 ║');
  console.log('╚═════════════════════════════════════════════════╝\n');
}

async function waitForKeyPress() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}

async function main() {
  displayGreeting();
  
  try {
    await bookAllMeals();
    console.log('✅ Operation completed successfully!');
  } catch (error) {
    console.log('❌ Operation failed. Please check the error above.');
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('💻 Developed by: Yousef Ehab\n');
  console.log('⭐ If this helped you, share it with friends!\n');
  
  const countdownPromise = countdown(15);
  const keyPressPromise = waitForKeyPress();
  
  await Promise.race([countdownPromise, keyPressPromise]);
  
  console.log('\n👋 SEE YOUU!');
  process.exit(0);
}

main();