import fs from 'fs/promises';
import inquirer from 'inquirer';

async function saveCredentials(studentId, password) {
  const credentials = {
    studentId: studentId,
    password: password,
    savedAt: new Date().toISOString()
  };
  
  await fs.writeFile('credentials.json', JSON.stringify(credentials, null, 2));
  console.log('✅ Credentials saved successfully!\n');
}

async function loadCredentials() {
  try {
    const data = await fs.readFile('credentials.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function getCredentials(validateLogin = null) {
  let credentials = await loadCredentials();
  
  if (!credentials) {
    console.log('\n🎓 Welcome to the Meal Booking System!');
    console.log('📝 Please enter your credentials (will be saved for future use):\n');
    
    let validCredentials = false;
    
    while (!validCredentials) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'studentId',
          message: '📝 Student ID:',
          validate: (input) => {
            if (input.length === 0) return 'Please enter your student ID!';
            if (input.length !== 14) return 'Student ID must be 14 digits!';
            return true;
          }
        },
        {
          type: 'password',
          name: 'password',
          message: '🔒 Password:',
          mask: '*',
          validate: (input) => input.length > 0 || 'Please enter your password!'
        }
      ]);
      
      // Validate credentials if validation function is provided
      if (validateLogin) {
        console.log('🔄 Verifying credentials...');
        const isValid = await validateLogin(answers.studentId, answers.password);
        
        if (isValid) {
          validCredentials = true;
          await saveCredentials(answers.studentId, answers.password);
          return { studentId: answers.studentId, password: answers.password };
        } else {
          console.log('❌ Invalid credentials! Please try again.\n');
        }
      } else {
        await saveCredentials(answers.studentId, answers.password);
        return { studentId: answers.studentId, password: answers.password };
      }
    }
    
  } else {
    console.log(`✅ Using saved credentials (ID: ${credentials.studentId})\n`);
    return { studentId: credentials.studentId, password: credentials.password };
  }
}

async function resetCredentials() {
  try {
    await fs.unlink('credentials.json');
    console.log('✅ Saved credentials deleted successfully!');
  } catch (error) {
    console.log('⚠️  No saved credentials found');
  }
}

export { getCredentials, resetCredentials };