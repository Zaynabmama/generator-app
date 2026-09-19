import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, Card } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getPricing, savePricing } from '@/src/hooks/use-pricing';
import { showAlert } from '@/src/utils/alert';
import { sanitizeDecimal } from '@/src/utils/numeric-input';

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kwhRate, setKwhRate] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');

  useEffect(() => {
    getPricing().then((p) => {
      setKwhRate(String(p.kwhRate));
      setMonthlyFee(String(p.monthlyFee));
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    const rate = parseFloat(kwhRate);
    const fee = parseFloat(monthlyFee);

    if (isNaN(rate) || rate <= 0 || isNaN(fee) || fee < 0) {
      showAlert('خطأ', 'الرجاء إدخال قيم صحيحة');
      return;
    }

    setSaving(true);
    try {
      await savePricing(rate, fee);
      showAlert('نجاح', 'تم حفظ الإعدادات بنجاح');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Button
            mode="text"
            onPress={() => router.back()}
            icon="arrow-right"
            textColor="#4CAF50"
          >
            رجوع
          </Button>
          <Text style={styles.headerTitle}>الإعدادات</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.scrollView}>
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>أسعار الفواتير</Text>
              <Text style={styles.hint}>
                تُستخدم هذه القيم عند إنشاء أي فاتورة جديدة
              </Text>

              <TextInput
                label="سعر الكيلوواط ($)"
                value={kwhRate}
                onChangeText={(text) => setKwhRate(sanitizeDecimal(text))}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
                editable={!loading}
              />

              <TextInput
                label="رسم الاشتراك الشهري ($)"
                value={monthlyFee}
                onChangeText={(text) => setMonthlyFee(sanitizeDecimal(text))}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
                editable={!loading}
              />
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving || loading}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
          >
            حفظ الإعدادات
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
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
  scrollView: {
    flex: 1,
  },
  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#1E1E1E',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  submitButton: {
    margin: 16,
    backgroundColor: '#4CAF50',
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
});
