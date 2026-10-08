// The language of the Windows dialogs of Coulisses.exe and Coulisses Setup.exe (compiled into both by app\build.ps1):
// the same choice as the pages (lib/i18n.mjs). COULISSES_LANG wins (the tests), then the user's choice kept in
// %LOCALAPPDATA%\Coulisses\settings.json ({ "lang": "en" }; COULISSES_SETTINGS = another file), then the Windows display
// language: French -> fr, anything else -> en. L.T("texte français", "English text").
using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;

static class L
{
    static string lang;
    public static string Lang { get { if (lang == null) lang = Detect(); return lang; } }
    public static string T(string fr, string en) { return Lang == "fr" ? fr : en; }
    static string Pick(string s) { s = (s ?? "").Trim().ToLowerInvariant(); return s.Length == 0 ? null : s.StartsWith("fr") ? "fr" : "en"; }
    static string Detect()
    {
        string v = Pick(Environment.GetEnvironmentVariable("COULISSES_LANG"));
        if (v != null) return v;
        try
        {
            string f = Environment.GetEnvironmentVariable("COULISSES_SETTINGS");
            if (string.IsNullOrEmpty(f)) f = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Coulisses", "settings.json");
            if (File.Exists(f))
            {
                Match m = Regex.Match(File.ReadAllText(f), "\"lang\"\\s*:\\s*\"([^\"]*)\"");
                if (m.Success) { v = Pick(m.Groups[1].Value); if (v != null) return v; }
            }
        }
        catch { }
        return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fr" ? "fr" : "en";
    }
}
