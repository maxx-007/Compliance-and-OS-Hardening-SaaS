# compliance_full_report.py
import os
import json
from datetime import datetime
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import landscape, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

# =========================
# 1) RULES (CIS, ISO27001, RBI) - 10 each (weights used)
# =========================
rules = [
    # CIS (10)
    {"id":"CIS-1","framework":"CIS","description":"Minimum password length >= 12","field":"password_policy.min_length","op":">=","value":12,"weight":5,
     "remediation":"Set system password policy minimum length to 12 or more."},
    {"id":"CIS-2","framework":"CIS","description":"Password complexity required","field":"password_policy.complexity_required","op":"==","value":True,"weight":4,
     "remediation":"Enable password complexity (upper/lower/digit/special) in PAM/AD policies."},
    {"id":"CIS-3","framework":"CIS","description":"Firewall enabled","field":"firewall_enabled","op":"==","value":True,"weight":5,
     "remediation":"Enable host/network firewall and ensure default deny rules are applied."},
    {"id":"CIS-4","framework":"CIS","description":"Audit logging enabled","field":"logging.audit_enabled","op":"==","value":True,"weight":4,
     "remediation":"Enable auditd or Windows Event forwarders to central SIEM."},
    {"id":"CIS-5","framework":"CIS","description":"Disk encryption enabled","field":"disk_encrypted","op":"==","value":True,"weight":4,
     "remediation":"Enable LUKS/BitLocker or full-disk encryption for servers with sensitive data."},
    {"id":"CIS-6","framework":"CIS","description":"No insecure services like ftp running","field":"services.ftp.status","op":"==","value":"stopped","weight":3,
     "remediation":"Stop and remove FTP service; use SFTP or secure alternatives."},
    {"id":"CIS-7","framework":"CIS","description":"SSH root login disabled","field":"ssh_root_login","op":"==","value":False,"weight":5,
     "remediation":"Set PermitRootLogin no in /etc/ssh/sshd_config and restart sshd."},
    {"id":"CIS-8","framework":"CIS","description":"OS patch age <= 30 days","field":"patch_age_days","op":"<=","value":30,"weight":5,
     "remediation":"Ensure systems are patched automatically or within 30 days via patch management."},
    {"id":"CIS-9","framework":"CIS","description":"Open DB ports not public (3306 not in open_ports)","field":"open_ports","op":"not_contains","value":3306,"weight":4,
     "remediation":"Close public DB ports or restrict via security groups/firewall."},
    {"id":"CIS-10","framework":"CIS","description":"Audit rules present (auditd)","field":"audit_rules_present","op":"==","value":True,"weight":4,
     "remediation":"Configure audit rules for critical files and processes."},

    # ISO 27001 (10)
    {"id":"ISO-1","framework":"ISO27001","description":"Access reviews performed within 90 days","field":"access_review_days","op":"<=","value":90,"weight":5,
     "remediation":"Schedule and record access reviews every <= 90 days."},
    {"id":"ISO-2","framework":"ISO27001","description":"Data backup policy exists and tested","field":"backup_policy.exists_and_tested","op":"==","value":True,"weight":4,
     "remediation":"Implement backup policy and run restore tests periodically."},
    {"id":"ISO-3","framework":"ISO27001","description":"Incident response plan exists","field":"incident_response.plan_exists","op":"==","value":True,"weight":5,
     "remediation":"Draft & publish an incident response playbook and owner matrix."},
    {"id":"ISO-4","framework":"ISO27001","description":"Incident response tested in last 12 months","field":"incident_response.last_test_days","op":"<=","value":365,"weight":4,
     "remediation":"Conduct IR tabletop/exercise within last 12 months."},
    {"id":"ISO-5","framework":"ISO27001","description":"Endpoint protection (AV) running","field":"antivirus.running","op":"==","value":True,"weight":4,
     "remediation":"Deploy endpoint protection on all servers/workstations."},
    {"id":"ISO-6","framework":"ISO27001","description":"Encryption at rest for sensitive DBs","field":"encryption.db_at_rest","op":"==","value":True,"weight":5,
     "remediation":"Enable DB encryption (TDE or filesystem encryption) for sensitive DBs."},
    {"id":"ISO-7","framework":"ISO27001","description":"Secure configuration baseline applied (CIS)","field":"baseline.cis_applied","op":"==","value":True,"weight":4,
     "remediation":"Apply and enforce CIS benchmarks baseline via config management."},
    {"id":"ISO-8","framework":"ISO27001","description":"Segregation of duties enforced for admin roles","field":"iam.separation_of_duties","op":"==","value":True,"weight":4,
     "remediation":"Implement role separation and approval workflows."},
    {"id":"ISO-9","framework":"ISO27001","description":"Change management process enforced","field":"change_mgmt.process_enforced","op":"==","value":True,"weight":3,
     "remediation":"Enforce change approvals and track them in ticketing system."},
    {"id":"ISO-10","framework":"ISO27001","description":"Third-party/vendor risk assessments done","field":"vendor_risk.assessments_up_to_date","op":"==","value":True,"weight":3,
     "remediation":"Perform vendor risk reviews and track remediation."},

    # RBI (10)
    {"id":"RBI-1","framework":"RBI","description":"MFA enabled for critical systems","field":"iam.mfa_for_admins","op":"==","value":True,"weight":5,
     "remediation":"Enable MFA for admin & privileged accounts using authenticator/OTP/hardware tokens."},
    {"id":"RBI-2","framework":"RBI","description":"Transaction logs retained for 5 years","field":"data_retention.transaction_logs_days","op":">=","value":365*5,"weight":5,
     "remediation":"Configure retention for transaction logs >= 5 years in secure storage."},
    {"id":"RBI-3","framework":"RBI","description":"Quarterly VAPT","field":"vapt.last_days","op":"<=","value":90,"weight":5,
     "remediation":"Run VAPT quarterly and remediate critical findings."},
    {"id":"RBI-4","framework":"RBI","description":"Encryption of customer data in transit and at rest","field":"encryption.customer_data","op":"==","value":True,"weight":5,
     "remediation":"Enable TLS 1.2+ for transit and AES-256 for data at rest."},
    {"id":"RBI-5","framework":"RBI","description":"Dedicated SOC monitoring in place","field":"soc.enabled","op":"==","value":True,"weight":4,
     "remediation":"Deploy SOC or MSSP with 24/7 monitoring on critical channels."},
    {"id":"RBI-6","framework":"RBI","description":"Incident reporting to CERT-In/RBI within timelines","field":"incident_reporting.last_report_days","op":"<=","value":7,"weight":4,
     "remediation":"Report incidents to CERT-In/RBI within mandated timelines."},
    {"id":"RBI-7","framework":"RBI","description":"Secure coding & SAST in CI pipeline","field":"devsecops.sast_enabled","op":"==","value":True,"weight":3,
     "remediation":"Integrate SAST and fix findings during CI builds."},
    {"id":"RBI-8","framework":"RBI","description":"Customer data access logged and reviewed monthly","field":"data_access.review_days","op":"<=","value":30,"weight":4,
     "remediation":"Review access logs monthly for sensitive data access."},
    {"id":"RBI-9","framework":"RBI","description":"DLP controls in place","field":"dlp.enabled","op":"==","value":True,"weight":4,
     "remediation":"Deploy DLP for exfiltration control on endpoints and gateways."},
    {"id":"RBI-10","framework":"RBI","description":"BCP tested annually","field":"bcp.last_test_days","op":"<=","value":365,"weight":4,
     "remediation":"Test BCP/DR annually and document results."}
]

# =========================
# 2) MOCK COMPANIES (3)
# =========================
company_data = {
    "company_A": {
        "password_policy": {"min_length": 14, "complexity_required": True},
        "firewall_enabled": True,
        "logging": {"audit_enabled": True},
        "disk_encrypted": True,
        "services": {"ftp": {"status": "stopped"}},
        "ssh_root_login": False,
        "patch_age_days": 10,
        "open_ports": [22, 80, 443],
        "audit_rules_present": True,
        "access_review_days": 60,
        "backup_policy": {"exists_and_tested": True},
        "incident_response": {"plan_exists": True, "last_test_days": 200},
        "antivirus": {"running": True},
        "encryption": {"db_at_rest": True, "customer_data": True},
        "baseline": {"cis_applied": True},
        "iam": {"separation_of_duties": True, "mfa_for_admins": True},
        "change_mgmt": {"process_enforced": True},
        "vendor_risk": {"assessments_up_to_date": True},
        "data_retention": {"transaction_logs_days": 365*6},
        "vapt": {"last_days": 45},
        "soc": {"enabled": True},
        "incident_reporting": {"last_report_days": 3},
        "devsecops": {"sast_enabled": True},
        "data_access": {"review_days": 20},
        "dlp": {"enabled": True},
        "bcp": {"last_test_days": 200}
    },
    "company_B": {
        "password_policy": {"min_length": 10, "complexity_required": False},
        "firewall_enabled": False,
        "logging": {"audit_enabled": False},
        "disk_encrypted": False,
        "services": {"ftp": {"status": "running"}},
        "ssh_root_login": True,
        "patch_age_days": 50,
        "open_ports": [22, 80, 3306],
        "audit_rules_present": False,
        "access_review_days": 200,
        "backup_policy": {"exists_and_tested": False},
        "incident_response": {"plan_exists": False, "last_test_days": 800},
        "antivirus": {"running": False},
        "encryption": {"db_at_rest": False, "customer_data": False},
        "baseline": {"cis_applied": False},
        "iam": {"separation_of_duties": False, "mfa_for_admins": False},
        "change_mgmt": {"process_enforced": False},
        "vendor_risk": {"assessments_up_to_date": False},
        "data_retention": {"transaction_logs_days": 365},
        "vapt": {"last_days": 400},
        "soc": {"enabled": False},
        "incident_reporting": {"last_report_days": 20},
        "devsecops": {"sast_enabled": False},
        "data_access": {"review_days": 120},
        "dlp": {"enabled": False},
        "bcp": {"last_test_days": 800}
    },
    "company_C": {
        "password_policy": {"min_length": 12, "complexity_required": True},
        "firewall_enabled": True,
        "logging": {"audit_enabled": True},
        "disk_encrypted": False,
        "services": {"ftp": {"status": "stopped"}},
        "ssh_root_login": False,
        "patch_age_days": 25,
        "open_ports": [22, 443],
        "audit_rules_present": True,
        "access_review_days": 95,
        "backup_policy": {"exists_and_tested": True},
        "incident_response": {"plan_exists": True, "last_test_days": 400},
        "antivirus": {"running": True},
        "encryption": {"db_at_rest": False, "customer_data": True},
        "baseline": {"cis_applied": True},
        "iam": {"separation_of_duties": True, "mfa_for_admins": True},
        "change_mgmt": {"process_enforced": True},
        "vendor_risk": {"assessments_up_to_date": False},
        "data_retention": {"transaction_logs_days": 365*5},
        "vapt": {"last_days": 120},
        "soc": {"enabled": False},
        "incident_reporting": {"last_report_days": 10},
        "devsecops": {"sast_enabled": True},
        "data_access": {"review_days": 35},
        "dlp": {"enabled": True},
        "bcp": {"last_test_days": 400}
    }
}

# =========================
# 3) EVALUATOR
# =========================
def get_field_value(data, field_path):
    parts = field_path.split(".")
    v = data
    try:
        for p in parts:
            if isinstance(v, dict):
                v = v.get(p, None)
            else:
                return None
        return v
    except Exception:
        return None

def evaluate_rule(rule, data):
    field = rule["field"]
    op = rule["op"]
    expected = rule["value"]
    weight = rule.get("weight", 1)
    actual = get_field_value(data, field)
    if actual is None:
        return 0, "WARNING", f"Missing field {field}"
    try:
        if op == "==":
            if actual == expected:
                return weight, "PASS", ""
            else:
                return 0, "FAIL", f"Expected {expected}, got {actual}"
        if op == ">=":
            if actual >= expected:
                return weight, "PASS", ""
            else:
                return 0, "FAIL", f"Expected >= {expected}, got {actual}"
        if op == "<=":
            if actual <= expected:
                return weight, "PASS", ""
            else:
                return 0, "FAIL", f"Expected <= {expected}, got {actual}"
        if op == "not_contains":
            if isinstance(actual, list):
                if expected not in actual:
                    return weight, "PASS", ""
                else:
                    return 0, "FAIL", f"Value {expected} present in list"
            else:
                return 0, "WARNING", f"Field {field} not a list"
        return 0, "WARNING", f"Unsupported op {op}"
    except Exception as e:
        return 0, "ERROR", str(e)

def evaluate_company(data, rules):
    frameworks = {}
    for r in rules:
        fw = r["framework"]
        frameworks.setdefault(fw, {"rules": [], "total_weight": 0})
        frameworks[fw]["rules"].append(r)
        frameworks[fw]["total_weight"] += r.get("weight",1)

    fw_results = {}
    for fw, meta in frameworks.items():
        total_weight = meta["total_weight"]
        score = 0
        details = []
        for r in meta["rules"]:
            weight, status, msg = evaluate_rule(r, data)
            # add score only when PASS
            score += weight
            details.append({
                "rule_id": r["id"],
                "description": r["description"],
                "status": status,
                "message": msg,
                "remediation": r.get("remediation","")
            })
        pct = round((score/total_weight)*100,2) if total_weight>0 else 0.0
        fw_results[fw] = {"compliance_pct": pct, "total_weight": total_weight, "score_weight": score, "details": details}
    return fw_results

# =========================
# 4) RUN EVAL FOR ALL COMPANIES
# =========================
all_results = {}
for company, data in company_data.items():
    all_results[company] = evaluate_company(data, rules)

# Save JSON results
os.makedirs("compliance_output", exist_ok=True)
timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
json_out = os.path.join("compliance_output", f"compliance_results_{timestamp}.json")
with open(json_out, "w") as f:
    json.dump(all_results, f, indent=2)

# =========================
# 5) BUILD HEATMAP (frameworks x companies)
# =========================
frameworks_sorted = sorted({r["framework"] for r in rules})
companies_sorted = sorted(company_data.keys())
heatmap = np.zeros((len(frameworks_sorted), len(companies_sorted)))
for i, fw in enumerate(frameworks_sorted):
    for j, comp in enumerate(companies_sorted):
        heatmap[i,j] = all_results[comp][fw]["compliance_pct"]

# Plot heatmap and save image
plt.figure(figsize=(10,6))
im = plt.imshow(heatmap, cmap="RdYlGn", vmin=0, vmax=100, aspect='auto')
plt.xticks(np.arange(len(companies_sorted)), companies_sorted)
plt.yticks(np.arange(len(frameworks_sorted)), frameworks_sorted)
for i in range(len(frameworks_sorted)):
    for j in range(len(companies_sorted)):
        plt.text(j, i, f"{heatmap[i,j]:.1f}%", ha="center", va="center", color="black", fontsize=10)
plt.colorbar(im, label="Compliance %")
plt.title("Compliance % Heatmap (Frameworks vs Companies)")
plt.xlabel("Company")
plt.ylabel("Framework")
plt.tight_layout()
heatmap_png = os.path.join("compliance_output", f"compliance_heatmap_{timestamp}.png")
plt.savefig(heatmap_png, dpi=200)
plt.close()

# =========================
# 6) GENERATE DETAILED TABLE (Excel) and flattened CSV for per-rule view
# =========================
rows = []
for company, fwdata in all_results.items():
    for fw, vals in fwdata.items():
        for d in vals["details"]:
            rows.append({
                "company": company,
                "framework": fw,
                "rule_id": d["rule_id"],
                "description": d["description"],
                "status": d["status"],
                "message": d["message"],
                "remediation": d["remediation"]
            })
df_rules = pd.DataFrame(rows)
excel_path = os.path.join("compliance_output", f"compliance_detailed_{timestamp}.xlsx")
df_rules.to_excel(excel_path, index=False)

# Also save a summary Excel
summary_rows = []
for company, fwdata in all_results.items():
    for fw, vals in fwdata.items():
        summary_rows.append({
            "company": company,
            "framework": fw,
            "compliance_pct": vals["compliance_pct"],
            "total_weight": vals["total_weight"],
            "score_weight": vals["score_weight"]
        })
df_summary = pd.DataFrame(summary_rows)
summary_excel = os.path.join("compliance_output", f"compliance_summary_{timestamp}.xlsx")
df_summary.to_excel(summary_excel, index=False)

# =========================
# 7) CREATE PDF (one-page summary + heatmap + remediation list)
# =========================
pdf_path = os.path.join("compliance_output", f"compliance_report_{timestamp}.pdf")
doc = SimpleDocTemplate(pdf_path, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=18)
styles = getSampleStyleSheet()
story = []

# Title
story.append(Paragraph("Compliance Automation Report", styles["Title"]))
story.append(Paragraph(f"Generated: {datetime.utcnow().isoformat()}Z", styles["Normal"]))
story.append(Spacer(1, 12))

# Summary table (framework compliance per company)
table_data = [["Company"] + frameworks_sorted]
for comp in companies_sorted:
    row = [comp]
    for fw in frameworks_sorted:
        val = all_results[comp][fw]["compliance_pct"]
        row.append(f"{val:.1f}%")
    table_data.append(row)

t = Table(table_data, hAlign="LEFT")
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2E75B6")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
    ("BOTTOMPADDING", (0,0), (-1,0), 8)
]))
story.append(t)
story.append(Spacer(1,12))

# Add heatmap image
story.append(Paragraph("<b>Heatmap: Compliance % (Frameworks vs Companies)</b>", styles["Heading3"]))
story.append(Spacer(1,6))
story.append(Image(heatmap_png, width=700, height=300))
story.append(Spacer(1,12))

# Add remediation list (top 15 non-compliant items by severity approximate via weight)
story.append(Paragraph("<b>Top Non-Compliant Rules & Remediations</b>", styles["Heading3"]))
# Build a prioritized remediation list: count fails and show remediations
fail_rows = df_rules[df_rules["status"] != "PASS"].copy()
# Simple prioritization: we show all fails; sort by framework then rule_id (you could refine)
fail_rows = fail_rows.sort_values(["framework","rule_id"]).head(20)

for _, r in fail_rows.iterrows():
    story.append(Paragraph(f"<b>[{r['framework']}] {r['rule_id']}</b> — {r['description']}", styles["Normal"]))
    story.append(Paragraph(f"Remediation: {r['remediation']}", styles["Italic"]))
    story.append(Spacer(1,6))

# Build PDF
doc.build(story)

# =========================
# 8) PRINT FINAL PATHS & quick console summary
# =========================
print("=== OUTPUT FILES ===")
print("JSON results: ", json_out)
print("Heatmap PNG:  ", heatmap_png)
print("Detailed Excel: ", excel_path)
print("Summary Excel:  ", summary_excel)
print("PDF report:    ", pdf_path)
print("\nQuick summary (framework % per company):")
print(df_summary.pivot(index="company", columns="framework", values="compliance_pct").fillna(0))
