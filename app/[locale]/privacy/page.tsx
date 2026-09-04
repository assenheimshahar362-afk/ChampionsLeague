import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { isLocale } from "@/i18n/routing";

const EMAIL = "assenheim.shahar@gmail.com";
const copy: Record<"he" | "en", { title: string; description: string; updated: string; sections: LegalSection[] }> = {
  he: {
    title: "מדיניות פרטיות",
    description: "המדיניות מסבירה איזה מידע אלופות אוספת, מדוע, עם מי הוא משותף וכיצד ניתן לממש זכויות ביחס אליו.",
    updated: "גרסה: 4 בספטמבר 2026",
    sections: [
      { title: "מי אחראי למידע", paragraphs: [`SA Software Solutions מפעילה את אלופות ואחראית לעיבוד המידע המתואר כאן. לפניות פרטיות, מחיקה או מימוש זכויות: ${EMAIL}.`] },
      { title: "המידע שאנו אוספים", items: ["פרטי חשבון ואימות: מזהה משתמש, כתובת אימייל, ספק התחברות וזמני כניסה.", "פרופיל ותוכן: כינוי, תמונת פרופיל, קבוצה אהודה, קבוצות חברים ותמונות קבוצה.", "פעילות במשחק: ניחושים, בחירות עונה, ניקוד, תפקידים בקבוצה וסטטוס אישור הצטרפות.", "מידע טכני הכרחי להפעלה ולאבטחה, כגון כתובת IP, cookies של session, לוגים, סוג דפדפן ונתוני שגיאה."] },
      { title: "מטרות השימוש", items: ["יצירת חשבון, אימות משתמש והפעלת המשחק, הקבוצות והדירוגים.", "שמירת ניחושים, חישוב ניקוד, מניעת הונאה ואכיפת מועדי נעילה.", "אבטחה, ניטור תקלות, הגבלת שימוש לרעה ושיפור השירות.", "מענה לפניות, חובות משפטיות והגנה על זכויות המשתמשים והמפעיל."] },
      { title: "ספקים והעברת מידע", paragraphs: ["האתר נעזר בספקי תשתית מהימנים לצורכי אימות, מסד נתונים, אחסון, אירוח ולוגים. כאשר נבחרת כניסה באמצעות Google, תהליך ההזדהות מתבצע גם באמצעותה. ספקים אלה עשויים לעבד מידע מחוץ לישראל בהתאם לתנאים ולאמצעי ההגנה שלהם.", "שירותי ניתוח ממוחשב ומקורות נתוני ספורט משמשים לעיבוד מידע על משחקים. אין כוונה לשלוח אליהם את פרטי החשבון האישיים שלכם. ניתן לפנות אלינו לקבלת מידע נוסף על קטגוריות הספקים. מידע אישי לא יימכר למפרסמים."] },
      { title: "פרסום ושיתוף", paragraphs: ["הכינוי, התמונה, הניחושים לאחר שריקת הפתיחה והניקוד עשויים להיות גלויים למשתמשים אחרים בהתאם למסך. כתובת האימייל אינה ציבורית; מנהלי קבוצה עשויים לראות אותה לצורך ניהול הקבוצה.", "מידע יימסר לרשות מוסמכת או לצד אחר כאשר הדין מחייב, או כאשר הדבר נחוץ להגנה על השירות, המשתמשים או זכויות משפטיות."] },
      { title: "שמירה, cookies ואבטחה", paragraphs: ["המידע נשמר כל עוד החשבון פעיל וככל שנדרש לתפעול, גיבוי, מניעת הונאה או חובה משפטית. לאחר מחיקה, עותקי גיבוי עשויים להימחק במחזור הגיבוי הרגיל.", "האתר משתמש ב-cookies ובאחסון מקומי הכרחיים לשמירת session, שפה והעדפות נגישות. אין באתר cookies פרסומיים מטעם המפעיל.", "מיושמים בקרות גישה, הצפנת תעבורה, RLS והגבלות העלאה, אך אין מערכת מאובטחת באופן מוחלט."] },
      { title: "הזכויות שלכם", paragraphs: ["ניתן להוריד עותק מהמידע ולמחוק את החשבון מאזור הפרופיל. ניתן לפנות אלינו בבקשה לעיון, תיקון, מחיקה, הגבלת שימוש או בירור. ייתכן שנבקש אימות זהות לפני טיפול בבקשה."] },
      { title: "קטינים ושינויים", paragraphs: ["השירות מיועד לבני 18 ומעלה. קטין לא ייצור חשבון ללא אישור הורה או אפוטרופוס ובהתאם לדין. במקרה שנודע לנו על מידע שנאסף בניגוד לכך, ניתן לפנות אלינו למחיקתו.", "שינוי מהותי במדיניות יוצג באתר ותעודכן גרסת המסמך. המשך שימוש לאחר שינוי המחייב הסכמה עשוי לדרוש אישור מחדש."] },
    ],
  },
  en: {
    title: "Privacy Policy",
    description: "This policy explains what Alufot collects, why it is used, who receives it and how you can exercise your rights.",
    updated: "Version: 4 September 2026",
    sections: [
      { title: "Who controls your data", paragraphs: [`SA Software Solutions operates Alufot and controls the processing described here. For privacy, deletion or rights requests, contact ${EMAIL}.`] },
      { title: "Information we collect", items: ["Account and authentication data: user ID, email address, sign-in provider and sign-in times.", "Profile and content: nickname, profile image, favourite team, friend groups and group images.", "Game activity: predictions, season picks, scores, group roles and join-approval status.", "Technical data needed for operation and security, such as IP address, session cookies, logs, browser type and error data."] },
      { title: "How we use information", items: ["Create and authenticate accounts and operate the game, groups and leaderboards.", "Store predictions, calculate scores, prevent fraud and enforce lock times.", "Secure, monitor, troubleshoot and improve the service.", "Answer requests, comply with legal duties and protect users' and the operator's rights."] },
      { title: "Providers and international transfers", paragraphs: ["We use trusted infrastructure providers for authentication, database, storage, hosting and logs. When Google sign-in is selected, Google also handles the authentication process. These providers may process information outside Israel under their terms and safeguards.", "Automated analysis services and sports-data sources process match information. We do not intend to send them your personal account details. You may contact us for more information about provider categories. We do not sell personal data to advertisers."] },
      { title: "Visibility and disclosure", paragraphs: ["Your nickname, image, post-kickoff predictions and scores may be visible to other users as indicated in the interface. Email addresses are not public; a group manager may see a member's email to administer that group.", "We may disclose information to a competent authority or another party when required by law or needed to protect the service, users or legal rights."] },
      { title: "Retention, cookies and security", paragraphs: ["We retain information while the account is active and as needed for operations, backups, fraud prevention or legal duties. After deletion, backup copies may remain until the ordinary backup cycle completes.", "The site uses cookies and local storage required for sessions, language and accessibility preferences. The operator does not use advertising cookies.", "We use access controls, transport encryption, row-level security and upload restrictions, but no system can be completely secure."] },
      { title: "Your choices and rights", paragraphs: ["You can export a copy of your information and delete your account from your profile. You may contact us to request access, correction, deletion, restriction or clarification. We may verify your identity first."] },
      { title: "Children and changes", paragraphs: ["The service is intended for people aged 18 or older. A minor must not create an account without a parent or guardian's consent and compliance with applicable law. Contact us if information was collected contrary to this rule.", "Material changes will be posted on the site with a new document version. Changes that require consent may require you to accept the updated policy."] },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: copy[locale].title, description: copy[locale].description } : {};
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalDocument {...copy[locale]} />;
}