import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
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
import { customersAPI, generatorsAPI } from '@/src/services/api';
import { Picker } from '@react-native-picker/picker';

export default function AddCustomerScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [generators, setGenerators] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    area: 'المسعودية',
    amperage: '',
    meter_number: '',
    generator_id: '',
    previous_balance: '0',
    notes: '',
  });

  const areas = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

  useEffect(() => {
    fetchGenerators();
  }, []);

  const fetchGenerators = async () => {
    try {
      const response = await generatorsAPI.getAll();
      setGenerators(response.data);
      if (response.data.length > 0) {
        setFormData((prev) => ({ ...prev, generator_id: response.data[0].id }));
      }
    } catch (error) {
      console.error('Error fetching generators:', error);
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.phone ||
      !formData.address ||
      !formData.amperage ||
      !formData.meter_number ||
      !formData.generator_id
    ) {
      Alert.alert('خطأ', 'الرجاء إدخال جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      const data = {
        ...formData,
        amperage: parseInt(formData.amperage),
        previous_balance: parseFloat(formData.previous_balance),
      };

      await customersAPI.create(data);
      Alert.alert('نجاح', 'تم إضافة المشترك بنجاح');
      router.back();
    } catch (error: any) {
      Alert.alert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
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

              <TextInput
                label="العنوان *"
                value={formData.address}
                onChangeText={(text) =>
                  setFormData({ ...formData, address: text })
                }
                mode="outlined"
                multiline
                numberOfLines={2}
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
                label="عدد الأمبير *"
                value={formData.amperage}
                onChangeText={(text) =>
                  setFormData({ ...formData, amperage: text })
                }
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
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

              {generators.length > 0 && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.label}>المولد التابع له *</Text>
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
                label="الرصيد السابق (دينار)"
                value={formData.previous_balance}
                onChangeText={(text) =>
                  setFormData({ ...formData, previous_balance: text })
                }
                mode="outlined"
                keyboardType="numeric"
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