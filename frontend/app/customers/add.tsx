import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  SegmentedButtons,
  Card,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { customersAPI } from '@/src/services/api';
import { showAlert } from '@/src/utils/alert';

export default function AddCustomerScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    area: 'المسعودية',
    meter_number: '',
    previous_balance: '0',
    kwh_rate: '',
    notes: '',
  });

  const areas = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.phone ||
      !formData.meter_number
    ) {
      showAlert('خطأ', 'الرجاء إدخال جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      const data = {
        ...formData,
        generator_id: '',
        previous_balance: parseFloat(formData.previous_balance),
        kwh_rate: formData.kwh_rate ? parseFloat(formData.kwh_rate) : null,
      };

      await customersAPI.create(data);
      showAlert('نجاح', 'تم إضافة المشترك بنجاح');
      router.back();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
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
          <Text style={styles.headerTitle}>إضافة مشترك جديد</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.scrollView}>
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>المعلومات الأساسية</Text>

              <TextInput
                label="الاسم *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label="رقم الهاتف *"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
              />

            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>معلومات الاشتراك</Text>

              <Text style={styles.label}>المنطقة *</Text>
              <SegmentedButtons
                value={formData.area}
                onValueChange={(value) =>
                  setFormData({ ...formData, area: value })
                }
                buttons={areas.map((area) => ({ value: area, label: area }))}
                style={styles.segmented}
              />

              <TextInput
                label="رقم العداد *"
                value={formData.meter_number}
                onChangeText={(text) =>
                  setFormData({ ...formData, meter_number: text })
                }
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label="الرصيد السابق ($)"
                value={formData.previous_balance}
                onChangeText={(text) =>
                  setFormData({ ...formData, previous_balance: text })
                }
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
              />

              <TextInput
                label="سعر الكيلوواط الخاص بهذا المشترك ($)"
                value={formData.kwh_rate}
                onChangeText={(text) =>
                  setFormData({ ...formData, kwh_rate: text })
                }
                mode="outlined"
                keyboardType="numeric"
                placeholder="اتركه فارغاً لاستخدام السعر العام"
                style={styles.input}
              />

              <TextInput
                label="ملاحظات"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.input}
              />
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
          >
            حفظ المشترك
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
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  label: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  segmented: {
    marginBottom: 16,
  },
  pickerContainer: {
    marginBottom: 16,
  },
  pickerWrapper: {
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666',
  },
  picker: {
    color: '#fff',
    height: 50,
  },
  submitButton: {
    margin: 16,
    backgroundColor: '#4CAF50',
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
});