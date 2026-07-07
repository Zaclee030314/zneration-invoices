import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { COMPANY, DOC_TITLE, DOC_NUMBER_LABEL, formatRM } from "./company";
import { invoiceTotals, type InvoiceItem, type Invoice } from "./types";

const BLUE = "#1f4e79";
const GRAY_ROW = "#f2f2f2";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f1f1f" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  companyReg: { fontSize: 8, color: "#555", marginTop: 2 },
  invoiceTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: BLUE },
  billDateRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  billTo: { width: "60%" },
  billToHeader: { backgroundColor: BLUE, color: "white", paddingVertical: 3, paddingHorizontal: 6, fontFamily: "Helvetica-Bold" },
  billToBody: { marginTop: 4 },
  dateBox: { width: "35%" },
  dateRow: { flexDirection: "row", borderWidth: 1, borderColor: "#ccc", marginBottom: 2 },
  dateLabel: { width: "40%", padding: 4, backgroundColor: "#f7f7f7" },
  dateValue: { width: "60%", padding: 4 },
  table: { marginTop: 20, borderWidth: 1, borderColor: "#ccc" },
  tableHeader: { flexDirection: "row", backgroundColor: BLUE },
  tableHeaderCell: { color: "white", fontFamily: "Helvetica-Bold", padding: 5 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e0e0e0" },
  descCell: { width: "78%", padding: 5 },
  amtCell: { width: "22%", padding: 5, textAlign: "right" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  notesBox: { width: "58%" },
  notesHeader: { backgroundColor: BLUE, color: "white", paddingVertical: 3, paddingHorizontal: 6, fontFamily: "Helvetica-Bold" },
  notesBody: { padding: 6, borderWidth: 1, borderColor: "#ccc", borderTopWidth: 0, minHeight: 60 },
  totalsBox: { width: "38%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderColor: "#ddd", paddingVertical: 4 },
  totalsRowFinal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, marginTop: 2, borderTopWidth: 1, borderColor: "#333" },
  totalsLabel: { fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 28, textAlign: "center", fontSize: 8.5 },
  footerLine: { marginTop: 3 },
  hr: { borderBottomWidth: 1, borderColor: "#333", marginTop: 8, marginBottom: 6 },
});

export function InvoicePdfDocument({ invoice, items }: { invoice: Invoice; items: InvoiceItem[] }) {
  const { subtotal, salesTax, total } = invoiceTotals(invoice, items);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const dateStr = new Date(invoice.invoice_date).toLocaleDateString("en-MY", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{COMPANY.name}</Text>
            <Text style={styles.companyReg}>{COMPANY.regNo}</Text>
          </View>
          <Text style={styles.invoiceTitle}>{DOC_TITLE[invoice.doc_type]}</Text>
        </View>

        <View style={styles.billDateRow}>
          <View style={styles.billTo}>
            <Text style={styles.billToHeader}>Bill To:</Text>
            <View style={styles.billToBody}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{invoice.bill_to_name}</Text>
              {invoice.bill_to_reg_no ? <Text>{invoice.bill_to_reg_no}</Text> : null}
              {invoice.bill_to_address ? <Text>{invoice.bill_to_address}</Text> : null}
            </View>
          </View>
          <View style={styles.dateBox}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Date:</Text>
              <Text style={styles.dateValue}>{dateStr}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{DOC_NUMBER_LABEL[invoice.doc_type]}:</Text>
              <Text style={styles.dateValue}>{invoice.invoice_no}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: "78%" }]}>Description</Text>
            <Text style={[styles.tableHeaderCell, { width: "22%", textAlign: "right" }]}>Line Total (RM)</Text>
          </View>
          {sorted.map((item, i) => (
            <View key={item.id} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? "white" : GRAY_ROW }]}>
              <Text style={styles.descCell}>{item.description}</Text>
              <Text style={styles.amtCell}>{item.line_total != null ? formatRM(item.line_total) : "-"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.notesBox}>
            <Text style={styles.notesHeader}>Special Notes and Instructions</Text>
            <View style={styles.notesBody}>
              {invoice.bank_account ? <Text>{invoice.bank_account} {invoice.bank_name}</Text> : null}
              {invoice.special_notes ? <Text style={{ marginTop: 4 }}>{invoice.special_notes}</Text> : null}
            </View>
          </View>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text>Subtotal</Text>
              <Text>RM {formatRM(subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Sales Tax Rate</Text>
              <Text>{invoice.sales_tax_rate}%</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Sales Tax</Text>
              <Text>RM {formatRM(salesTax)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>RM {formatRM(invoice.discount)}</Text>
            </View>
            <View style={styles.totalsRowFinal}>
              <Text style={styles.totalsLabel}>Total</Text>
              <Text style={styles.totalsLabel}>RM {formatRM(total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Make all checks payable to {COMPANY.name}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 6 }}>Thank you for your business!</Text>
          <Text style={styles.footerLine}>
            Should you have any enquiries concerning this invoice, please contact {COMPANY.contact} on {COMPANY.tel}
          </Text>
          <View style={styles.hr} />
          <Text>{COMPANY.address}</Text>
          <Text style={styles.footerLine}>
            Tel: {COMPANY.tel} Fax: - E-mail: {COMPANY.email} Web: -
          </Text>
        </View>
      </Page>
    </Document>
  );
}
