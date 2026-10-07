// Coulisses Setup.exe (formerly « Brambleshire Studio Setup.exe ») — installs / updates Coulisses from the Dev workshop into
// C:\Users\<user>\AppData\Local\Programs\Coulisses with node install.mjs (which also moves it from its old place in the
// Brambleshire pipeline), puts « Coulisses » on the Desktop and in the Start menu (the old « Brambleshire Studio »
// shortcuts are removed), and makes a double-click on a .coulisses file open Coulisses (HKCU: for this user, no admin).
// Lives in the workshop, next to install.mjs. Built by app\build.ps1 (csc.exe, C# 5, nothing to install).
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("Coulisses Setup")]
[assembly: System.Reflection.AssemblyProduct("Coulisses")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

class SetupForm : Form
{
    static readonly Color Bg = Color.FromArgb(14, 16, 26), Panel = Color.FromArgb(24, 27, 40), Ink = Color.FromArgb(244, 245, 250), Muted = Color.FromArgb(174, 178, 196), Faint = Color.FromArgb(111, 116, 138), Lime = Color.FromArgb(201, 242, 107), Coral = Color.FromArgb(255, 143, 126);
    readonly string src = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
    internal string node, target;
    readonly RichTextBox logBox = new RichTextBox();
    readonly PillButton install = new PillButton("Installer", true), openBtn = new PillButton("Ouvrir Coulisses", false), close = new PillButton("Fermer", false);
    readonly Label status = new Label();

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Any(a => a.Equals("/silent", StringComparison.OrdinalIgnoreCase))) return Silent();
        Application.EnableVisualStyles(); Application.Run(new SetupForm()); return 0;
    }

    // « Coulisses Setup.exe /silent »: the same installation without the window (log in %LOCALAPPDATA%\Coulisses\setup.log)
    static int Silent()
    {
        string src = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Coulisses");
        Directory.CreateDirectory(local);
        StringBuilder log = new StringBuilder();
        int code = 1;
        try
        {
            SetupForm f = new SetupForm();
            f.node = FindNode();
            if (f.node == null) throw new Exception("Node.js introuvable");
            int c; f.target = f.RunNodeCode("install.mjs --where", out c).Trim().Split('\n').Last().Trim();
            string o = f.RunNodeCode("install.mjs", out c); log.AppendLine(o.Trim());
            if (c == 0)
            {
                log.AppendLine(f.Finish(Path.Combine(f.target, "Coulisses.exe")));
                code = 0;
            }
        }
        catch (Exception e) { log.AppendLine("Erreur : " + e.Message); }
        File.WriteAllText(Path.Combine(local, "setup.log"), DateTime.Now + "\r\n" + log.ToString().Replace("\n", "\r\n"), Encoding.UTF8);
        return code;
    }

    SetupForm()
    {
        Text = "Coulisses — installation"; BackColor = Bg; ForeColor = Ink; FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen; ClientSize = new Size(760, 520); Font = new Font("Segoe UI", 10f);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        PictureBox badge = new PictureBox { Size = new Size(48, 48), Location = new Point(28, 26), BackColor = Color.Transparent };
        badge.Paint += (s, e) => { e.Graphics.SmoothingMode = SmoothingMode.AntiAlias; using (GraphicsPath p = Round(new Rectangle(0, 0, 47, 47), 14)) using (LinearGradientBrush b = new LinearGradientBrush(new Rectangle(0, 0, 48, 48), Color.FromArgb(220, 247, 122), Color.FromArgb(111, 226, 201), 45f)) e.Graphics.FillPath(b, p); TextRenderer.DrawText(e.Graphics, "C", new Font("Segoe UI", 20f, FontStyle.Bold), new Rectangle(0, 0, 48, 48), Color.FromArgb(16, 20, 10), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter); };
        Controls.Add(badge);
        Controls.Add(new Label { Text = "Coulisses", Location = new Point(90, 24), AutoSize = true, Font = new Font("Segoe UI Semibold", 17f), ForeColor = Ink });
        Controls.Add(new Label { Text = "Installe ou met à jour Coulisses, ses raccourcis et l'ouverture des fichiers .coulisses.", Location = new Point(92, 58), AutoSize = true, ForeColor = Muted });
        status.Location = new Point(30, 96); status.Size = new Size(700, 44); status.ForeColor = Faint; Controls.Add(status);
        logBox.Location = new Point(30, 146); logBox.Size = new Size(700, 290); logBox.BackColor = Panel; logBox.ForeColor = Muted; logBox.BorderStyle = BorderStyle.None; logBox.ReadOnly = true; logBox.Font = new Font("Consolas", 9.5f);
        Controls.Add(logBox);
        install.Location = new Point(30, 456); install.Size = new Size(150, 42); Controls.Add(install);
        openBtn.Location = new Point(192, 456); openBtn.Size = new Size(170, 42); openBtn.Enabled = false; Controls.Add(openBtn);
        close.Location = new Point(610, 456); close.Size = new Size(120, 42); Controls.Add(close);
        install.Click += (s, e) => Start(false);
        openBtn.Click += (s, e) => { try { Process.Start(Path.Combine(target, "Coulisses.exe")); Close(); } catch (Exception x) { Log("Impossible d'ouvrir : " + x.Message, true); } };
        close.Click += (s, e) => Close();
        Shown += (s, e) => Prepare();
    }

    void Prepare()
    {
        node = FindNode();
        if (node == null) { Log("Node.js est introuvable : installe-le, puis relance l'installation.", true); install.Enabled = false; return; }
        if (!File.Exists(Path.Combine(src, "install.mjs")) || !File.Exists(Path.Combine(src, "Coulisses.exe"))) { Log("Cet installateur doit rester dans l'atelier de Coulisses (à côté de install.mjs et de « Coulisses.exe »).", true); install.Enabled = false; return; }
        string where = RunNode("install.mjs --where", null).Trim();
        target = where.Split('\n').Last().Trim();
        status.Text = "Depuis : " + src + "\nVers : " + target;
        string dry = RunNode("install.mjs --dry", null);
        Log(dry.Trim().Length > 0 ? dry.Trim() : "(rien à copier)", false);
        if (File.Exists(Path.Combine(target, "installed.json"))) install.Text = "Mettre à jour";
    }

    void Start(bool force)
    {
        install.Enabled = false; openBtn.Enabled = false;
        new Thread(() =>
        {
            try
            {
                // a studio of the pipeline is open: it must be closed (its code is replaced)
                if (StudioRunning())
                {
                    bool stop = (bool)Invoke(new Func<bool>(() => MessageBox.Show(this, "Coulisses est ouvert. Le fermer pour faire la mise à jour ?\n(tes notes sont enregistrées à chaque frappe)", Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK));
                    if (!stop) { Done(false); return; }
                    QuitStudio();
                }
                Log("— installation —", false);
                int code; string outp = RunNodeCode("install.mjs" + (force ? " --force" : ""), out code);
                Log(outp.Trim(), code != 0);
                if (code != 0)
                {
                    bool again = !force && outp.Contains("depuis la dernière installation") && (bool)Invoke(new Func<bool>(() => MessageBox.Show(this, "Des fichiers de Coulisses installé ont été modifiés directement dans sa copie.\nLes écraser avec la version de l'atelier ?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes));
                    if (again) { Invoke(new Action(() => Start(true))); return; }
                    Done(false); return;
                }
                Log(Finish(Path.Combine(target, "Coulisses.exe")), false);
                Log("Terminé.", false);
                Done(true);
            }
            catch (Exception x) { Log("Erreur : " + x.Message, true); Done(false); }
        }).Start();
    }

    void Done(bool ok) { Invoke(new Action(() => { install.Enabled = true; openBtn.Enabled = ok; if (ok) install.Text = "Mettre à jour"; })); }

    static string[] LockFiles()
    {
        string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new[] { "Coulisses", "BrambleshireStudio" }.Select(d => Path.Combine(la, d)).Where(Directory.Exists).SelectMany(d => Directory.GetFiles(d, "hub-*.json")).ToArray();
    }
    bool StudioRunning()
    {
        foreach (string p in new[] { "Coulisses", "Brambleshire Studio" }) if (Process.GetProcessesByName(p).Length > 0) return true;
        foreach (string f in LockFiles())
        {
            string j = File.ReadAllText(f);
            Match mi = Regex.Match(j, "\"pid\"\\s*:\\s*(\\d+)");
            if (mi.Success) try { Process.GetProcessById(int.Parse(mi.Groups[1].Value)); return true; } catch { }
        }
        foreach (int port in new[] { 4173, 4174, 4175, 4176 })
            try
            {
                HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/meta"); r.Timeout = 1200; r.Proxy = null;
                using (WebResponse resp = r.GetResponse()) using (StreamReader sr = new StreamReader(resp.GetResponseStream()))
                { string m = sr.ReadToEnd(); if (m.Contains("\"episode\"") && !m.ToLowerInvariant().Contains("sandbox")) return true; }
            }
            catch { }
        return false;
    }

    void QuitStudio()
    {
        foreach (string f in LockFiles())
        {
            string j = File.ReadAllText(f);
            Match mp = Regex.Match(j, "\"port\"\\s*:\\s*(\\d+)");
            if (mp.Success) try { using (WebClient wc = new WebClient()) wc.UploadString("http://127.0.0.1:" + mp.Groups[1].Value + "/api/quit", ""); } catch { }
        }
        Thread.Sleep(1500);
        // the app's own process (it waits for its window): the window is gone with the home screen, then it ends by itself
        foreach (string p in new[] { "Coulisses", "Brambleshire Studio" }) foreach (Process pr in Process.GetProcessesByName(p)) try { pr.WaitForExit(4000); if (!pr.HasExited) pr.Kill(); } catch { }
        Log("Coulisses fermé.", false);
    }

    // after install.mjs: the « Coulisses » shortcuts (the old « Brambleshire Studio » ones removed) and the .coulisses files
    internal string Finish(string exe)
    {
        string desk = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), menu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
        Shortcut(Path.Combine(desk, "Coulisses.lnk"), exe);
        Shortcut(Path.Combine(menu, "Coulisses.lnk"), exe);
        foreach (string old in new[] { Path.Combine(desk, "Brambleshire Studio.lnk"), Path.Combine(menu, "Brambleshire Studio.lnk") }) try { if (File.Exists(old)) File.Delete(old); } catch { }
        Associate(exe);
        return "Raccourcis « Coulisses » : Bureau et menu Démarrer -> " + exe + "\nFichiers .coulisses : un double-clic les ouvre dans Coulisses.";
    }
    // HKCU\Software\Classes: for this user only, no admin right
    static void Associate(string exe)
    {
        using (RegistryKey ext = Registry.CurrentUser.CreateSubKey(@"Software\Classes\.coulisses")) ext.SetValue("", "Coulisses.Projet");
        using (RegistryKey prog = Registry.CurrentUser.CreateSubKey(@"Software\Classes\Coulisses.Projet"))
        {
            prog.SetValue("", "Projet Coulisses");
            using (RegistryKey icon = prog.CreateSubKey("DefaultIcon")) icon.SetValue("", "\"" + exe + "\",0");
            using (RegistryKey cmd = prog.CreateSubKey(@"shell\open\command")) cmd.SetValue("", "\"" + exe + "\" \"%1\"");
        }
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);   // SHCNE_ASSOCCHANGED: Explorer shows the new icon at once
    }
    [System.Runtime.InteropServices.DllImport("shell32.dll")] static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);

    // a .lnk through the shell's own Unicode interface (IShellLinkW): WScript.Shell turned « Théatre » into « Theatre »
    internal void Shortcut(string lnk, string exe)
    {
        IShellLinkW link = (IShellLinkW)new ShellLinkCoClass();
        link.SetPath(exe);
        link.SetWorkingDirectory(Path.GetDirectoryName(exe));
        link.SetIconLocation(exe, 0);
        link.SetDescription("Coulisses : relire et annoter ses vidéos avant l'export");
        ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Save(lnk, true);
        StringBuilder check = new StringBuilder(1024);
        link.GetPath(check, check.Capacity, IntPtr.Zero, 0);
        if (!File.Exists(check.ToString())) throw new Exception("raccourci incorrect : " + check);
    }

    string RunNode(string a, string dummy) { int c; return RunNodeCode(a, out c); }
    internal string RunNodeCode(string a, out int code)
    {
        ProcessStartInfo p = new ProcessStartInfo(node, a);
        p.WorkingDirectory = src; p.UseShellExecute = false; p.CreateNoWindow = true;
        p.RedirectStandardOutput = true; p.RedirectStandardError = true; p.StandardOutputEncoding = Encoding.UTF8; p.StandardErrorEncoding = Encoding.UTF8;
        using (Process pr = Process.Start(p))
        {
            string o = pr.StandardOutput.ReadToEnd(), e = pr.StandardError.ReadToEnd();
            pr.WaitForExit(); code = pr.ExitCode;
            return o + (e.Length > 0 ? "\n" + e : "");
        }
    }

    void Log(string m, bool bad)
    {
        if (InvokeRequired) { Invoke(new Action(() => Log(m, bad))); return; }
        logBox.SelectionStart = logBox.TextLength; logBox.SelectionColor = bad ? Coral : Muted;
        logBox.AppendText(m.Replace("\r", "") + "\n"); logBox.ScrollToCaret();
    }

    static string FindNode()
    {
        foreach (string d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            try { string f = Path.Combine(d.Trim().Trim('"'), "node.exe"); if (d.Trim().Length > 0 && File.Exists(f)) return f; } catch { }
        string k = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        return File.Exists(k) ? k : null;
    }

    internal static GraphicsPath Round(Rectangle r, int rad)
    {
        GraphicsPath p = new GraphicsPath(); int d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90); p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90); p.CloseFigure();
        return p;
    }
}

// a pill-shaped button: lime gradient (primary) or glass
class PillButton : Control
{
    readonly bool primary; bool hover;
    public PillButton(string text, bool primary)
    {
        Text = text; this.primary = primary; Cursor = Cursors.Hand; Font = new Font("Segoe UI Semibold", 10.5f);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        MouseEnter += (s, e) => { hover = true; Invalidate(); }; MouseLeave += (s, e) => { hover = false; Invalidate(); };
    }
    protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); Invalidate(); }
    protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); Invalidate(); }
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
        using (GraphicsPath p = SetupForm.Round(r, Height / 2 - 1))
        {
            if (primary)
                using (LinearGradientBrush b = new LinearGradientBrush(r, Color.FromArgb(220, 247, 122), Color.FromArgb(111, 226, 201), 0f)) g.FillPath(b, p);
            else
                using (SolidBrush b = new SolidBrush(hover ? Color.FromArgb(44, 48, 66) : Color.FromArgb(32, 35, 50))) g.FillPath(b, p);
            if (!Enabled) using (SolidBrush b = new SolidBrush(Color.FromArgb(150, 14, 16, 26))) g.FillPath(b, p);
            if (primary && hover && Enabled) using (SolidBrush b = new SolidBrush(Color.FromArgb(30, 255, 255, 255))) g.FillPath(b, p);
        }
        TextRenderer.DrawText(g, Text, Font, r, primary ? Color.FromArgb(16, 20, 10) : Color.FromArgb(244, 245, 250), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

[System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("00021401-0000-0000-C000-000000000046")]
class ShellLinkCoClass { }

[System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.InterfaceType(System.Runtime.InteropServices.ComInterfaceType.InterfaceIsIUnknown), System.Runtime.InteropServices.Guid("000214F9-0000-0000-C000-000000000046")]
interface IShellLinkW
{
    void GetPath([System.Runtime.InteropServices.Out, System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([System.Runtime.InteropServices.Out, System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
    void SetDescription([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([System.Runtime.InteropServices.Out, System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
    void SetWorkingDirectory([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([System.Runtime.InteropServices.Out, System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
    void SetArguments([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([System.Runtime.InteropServices.Out, System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
    void SetIconLocation([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszFile);
}
