import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Chip, ActivityIndicator, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { invoicesAPI, customersAPI, readingsAPI } from '@/src/services/api';
import { showAlert } from '@/src/utils/alert';
import { getBillingMonth, shiftMonth, formatMonthDisplay } from '@/src/utils/billing-month';
import { buildInvoiceWhatsAppWebUrl } from '@/src/utils/whatsapp-invoice';

type QueueItem = { invoice: any; customer: any; reading: any };

export default function BulkSendScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(getBillingMonth());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const fetchQueue = async (targetMonth: string) => {
    try {
      setLoading(true);
      const [invoicesRes, customersRes, readingsRes] = await Promise.all([
        invoicesAPI.getAll({ month: targetMonth }),
        customersAPI.getAll(),
        readingsAPI.getAll(),
      ]);

      const customersById: Record<string, any> = {};
      customersRes.data.forEach((c: any) => (customersById[c.id] = c));

      const readingsById: Record<string, any> = {};
      readingsRes.data.forEach((r: any) => (readingsById[r.id] = r));

      const items: QueueItem[] = invoicesRes.data
        .filter((inv: any) => inv.status !== 'paid')
        .map((inv: any) => ({
          invoice: inv,
          customer: customersById[inv.customer_id],
          reading: readingsById[inv.reading_id],
        }))
        .filter((item: QueueItem) => item.customer && item.reading);

      items.sort((a, b) => {
        const areaCompare = (a.customer.area || '').localeCompare(b.customer.area || '');
        if (areaCompare !== 0) return areaCompare;
        return (a.customer.name || '').localeCompare(b.customer.name || '');
      });

      setQueue(items);
      setSentIds(new Set());
      setSkippedIds(new Set());
    } catch (error) {
      console.error('Error fetching bulk send queue:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchQueue(month);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [month])
  );

  const pendingQueue = useMemo(
    () => queue.filter((item) => !sentIds.has(item.invoice.id) && !skippedIds.has(item.invoice.id)),
    [queue, sentIds, skippedIds]
  );

  const current = pendingQueue[0];

  const handleSend = (item: QueueItem) => {
    const url = buildInvoiceWhatsAppWebUrl(item.customer, item.invoice, item.reading);
    window.open(url, '_blank');
    setSentIds((prev) => new Set(prev).add(item.invoice.id));
  };

  const handleSkip = (item: QueueItem) => {
    setSkippedIds((prev) => new Set(prev).add(item.invoice.id));
  };

  const statusOf = (item: QueueItem) => {
    if (sentIds.has(item.invoice.id)) return 'sent';
    if (skippedIds.has(item.invoice.id)) return 'skipped';
    return 'pending';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Button mode="text" onPress={() => router.back()} icon="arrow-right" textColor="#4CAF50">
          رجوع
        </Button>
        <Text style={styles.headerTitle}>إرسال جماعي عبر WhatsApp</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.monthRow}>
        <Button
          mode="outlined"
          compact
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          style={styles.monthStepButton}
        >
          الشهر السابق
        </Button>
        <Text style={styles.monthValue}>{formatMonthDisplay(month)}</Text>
        <Button
          mode="outlined"
          compact
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={styles.monthStepButton}
        >
          الشهر التالي
        </Button>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : queue.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>لا توجد فواتير غير مدفوعة لهذا الشهر</Text>
        </View>
      ) : (
        <>
          <Text style={styles.summaryText}>
            المتبقي: {pendingQueue.length} · تم الإرسال: {sentIds.size} · تم التخطي: {skippedIds.size} ·
            الإجمالي: {queue.length}
          </Text>

          {current ? (
            <View style={styles.currentCard}>
              <Text style={styles.currentName}>{current.customer.name}</Text>
              <Text style={styles.currentDetail}>
                {current.customer.area} · {current.customer.phone}
              </Text>
              <Text style={styles.currentAmount}>
                المبلغ المستحق: ${current.invoice.remaining_amount.toFixed(2)}
              </Text>
              <View style={styles.currentActions}>
                <Button
                  mode="contained"
                  icon="whatsapp"
                  onPress={() => handleSend(current)}
                  style={styles.sendButton}
                >
                  إرسال عبر WhatsApp
                </Button>
                <Button mode="outlined" onPress={() => handleSkip(current)} style={styles.skipButton}>
                  تخطي
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.doneCard}>
              <Text style={styles.doneText}>
                ✅ تم الانتهاء من كل الفواتير غير المدفوعة لشهر {formatMonthDisplay(month)}
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.listContent}>
            {queue.map((item) => {
              const status = statusOf(item);
              return (
                <View key={item.invoice.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName}>{item.customer.name}</Text>
                    <Text style={styles.rowDetail}>
                      {item.customer.area} · ${item.invoice.remaining_amount.toFixed(2)}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={[
                      styles.statusChip,
                      status === 'sent' && styles.statusSent,
                      status === 'skipped' && styles.statusSkipped,
                    ]}
                  >
                    {status === 'sent' ? 'تم الإرسال' : status === 'skipped' ? 'تم التخطي' : 'قيد الانتظار'}
                  </Chip>
                  <IconButton
                    icon="whatsapp"
                    iconColor="#4CAF50"
                    onPress={() => handleSend(item)}
                  />
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  monthStepButton: {
    flex: 1,
  },
  monthValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  summaryText: {
    fontSize: 13,
    color: '#999',
    padding: 16,
    paddingBottom: 0,
  },
  currentCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  currentName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  currentDetail: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  currentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    marginTop: 12,
  },
  currentActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  sendButton: {
    flex: 2,
    backgroundColor: '#4CAF50',
  },
  skipButton: {
    flex: 1,
  },
  doneCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 15,
    color: '#4CAF50',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    color: '#fff',
  },
  rowDetail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statusChip: {
    backgroundColor: '#2A2A2A',
  },
  statusSent: {
    backgroundColor: '#1B4D20',
  },
  statusSkipped: {
    backgroundColor: '#4D3A1B',
  },
});
