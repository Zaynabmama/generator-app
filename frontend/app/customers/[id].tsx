import React, { useState, useEffect } from 'react';
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
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { customersAPI, generatorsAPI } from '@/src/services/api';
import { Picker } from '@react-native-picker/picker';
import { showAlert } from '@/src/utils/alert';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generators, setGenerators] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '', // no longer editable in the UI; kept so saving doesn't wipe existing data
    area: 'المسعودية',
    meter_number: '',
    generator_id: '',
    previous_balance: '0',
    kwh_rate: '',
    notes: '',
  });

  const areas = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [customerRes, generatorsRes] = await Promise.all([
        customersAPI.getOne(id!),
        generatorsAPI.getAll(),
      ]);

      setGenerators(generatorsRes.data);

      const c = customerRes.data;
      setFormData({
        name: c.name || '',
        phone: c.phone || '',
        address: c.address || '',
        area: c.area || 'المسعودية',
        meter_number: c.meter_number || '',
        generator_id: c.generator_id || '',
        previous_balance: String(c.previous_balance || 0),
        kwh_rate: c.kwh_rate != null ? String(c.kwh_rate) : '',
        notes: c.notes || '',
      });
    } catch (error) {
      showAlert('خطأ', 'حدث خطأ أثناء تحميل بيانات المشترك');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.phone ||
      !formData.meter_number
    ) {
      showAlert('خطأ', 'الرجاء إدخال جميع الحقول المطلوبة');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        previous_balance: parseFloat(formData.previous_balance),
        kwh_rate: formData.kwh_rate ? parseFloat(formData.kwh_rate) : null,
      };

      await customersAPI.update(id!, data);
      showAlert('نجاح', 'تم تحديث بيانات المشترك بنجاح');
      router.back();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <IconButton
            icon="arrow-right"
            iconColor="#4CAF50"
            size={24}
            onPress={() => router.back()}
            testID="back-btn"
          />
          <Text style={styles.headerTitle}>تعديل بيانات المشترك</Text>
          <View style={{ width: 48 }} />
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
                testID="edit-name"
              />

              <TextInput
                label="رقم الهاتف *"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
                testID="edit-phone"
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
                testID="edit-meter"
              />

              {generators.length > 0 && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.label}>المولد التابع له</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={formData.generator_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, generator_id: value })
                      }
                      style={styles.picker}
                      dropdownIconColor="#fff"
                    >
                      {generators.map((gen) => (
                        <Picker.Item
                          key={gen.id}
                          label={gen.name}
                          value={gen.id}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              )}

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
            loading={saving}
            disabled={saving}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            testID="save-edit-btn"
          >
            حفظ التعديلات
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
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
