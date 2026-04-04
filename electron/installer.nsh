!include "MUI2.nsh"

!define MUI_ABORTWARNING

!define MUI_FINISHPAGE_RUN "MealSync.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch MealSync"

!define MUI_WELCOMEFINISHPAGE_BITMAP_TEXT "MealSync Setup"

!insertmacro MUI_PAGE_WELCOME
; if LICENSE file is missing, omit license page to avoid build error
; !insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

!macro customGuiInit
  !insertmacro MUI_HEADER_TEXT "MealSync Installer" "Your meal scheduling assistant is about to be installed."
!macroend

!macro customPageFinish
  !insertmacro MUI_HEADER_TEXT "Done" "MealSync is ready to use"
  !insertmacro MUI_DESCRIPTION_TEXT "Click Finish to close the setup wizard. Launch is checked by default."
!macroend

