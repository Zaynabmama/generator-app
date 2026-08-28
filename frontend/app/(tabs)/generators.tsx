import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
} from 'react-native';
import {
  Card,
  Text,
  FAB,
  IconButton,
  Menu,
  Dialog,
  Portal,
  Button,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { generatorsAPI } from '@/src/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { showAlert } from '@/src/utils/alert';

export default function GeneratorsScreen() {
  const [generators, setGenerators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedGenerator, setSelectedGenerator] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    capacity: '',
    notes: '',
  });

  const fetchGenerators = async () => {
    try {
      const response = await generatorsAPI.getAll();
      setGenerators(response.data);
    } catch (error) {
      console.error('Error fetching generators:', error);
      showAlert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGenerators();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchGenerators();
    }, [])
  );

  const handleAdd = () => {
    setEditMode(false);
    setFormData({ name: '', capacity: '', notes: '' });
    setDialogVisible(true);
  };

  const handleEdit = (generator: any) => {
    setEditMode(true);
    setSelectedGenerator(generator);
    setFormData({
      name: generator.name,
      capacity: generator.capacity.toString(),
      notes: generator.notes || '',
    });
    setMenuVisible(null);
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.capacity) {
      showAlert('خطأ', 'الرجاء إدخال جميع الحقول المطلوبة');
      return;
    }

    try {
      const data = {
        name: formData.name,
        capacity: parseInt(formData.capacity),
        notes: formData.notes,
      };

      if (editMode && selectedGenerator) {
        await generatorsAPI.update(selectedGenerator.id, data);
        showAlert('نجاح', 'تم تحديث المولد بنجاح');
      } else {
        await generatorsAPI.create(data);
        showAlert('نجاح', 'تم إضافة المولد بنجاح');
      }

      setDialogVisible(false);
      fetchGenerators();
    } catch (error: any) {
      showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    showAlert(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف المولد "${name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await generatorsAPI.delete(id);
              fetchGenerators();
              showAlert('نجاح', 'تم حذف المولد بنجاح');
            } catch (error: any) {
              showAlert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحذف');
            }
          },
        },
      ]
    );
  };

  const renderGenerator = ({ item }: any) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.generatorInfo}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="engine" size={24} color="#4CAF50" />
              <Text style={styles.generatorName}>{item.name}</Text>
            </View>
            <Text style={styles.capacity}>{item.capacity} kVA</Text>
          </View>
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <IconButton
                icon="dots-vertical"
                onPress={() => setMenuVisible(item.id)}
              />
            }
          >
            <Menu.Item
              onPress={() => handleEdit(item)}
              title="تعديل"
            />
            <Menu.Item
              onPress={() => {
                setMenuVisible(null);
                handleDelete(item.id, item.name);
              }}
              title="حذف"
            />
          </Menu>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="account-group" size={20} color="#2196F3" />
            <Text style={styles.statText}>
              {item.subscriber_count} مشترك
            </Text>
          </View>
        </View>

        {item.notes && (
          <Text style={styles.notes}>ملاحظات: {item.notes}</Text>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={generators}
        renderItem={renderGenerator}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchGenerators}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="engine-off" size={64} color="#666" />
            <Text style={styles.emptyText}>لا توجد مولدات</Text>
            <Text style={styles.emptySubtext}>اضغط زر + لإضافة مولد جديد</Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={handleAdd}
        label="إضافة مولد"
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>
            {editMode ? 'تعديل مولد' : 'إضافة مولد جديد'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="اسم المولد"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              mode="outlined"
              style={styles.input}
              placeholder="مثال: مولد 150 kVA"
            />
            <TextInput
              label="القدرة (kVA)"
              value={formData.capacity}
              onChangeText={(text) => setFormData({ ...formData, capacity: text })}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              placeholder="150, 250, 300"
            />
            <TextInput
              label="ملاحظات (اختياري)"
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>إلغاء</Button>
            <Button onPress={handleSave}>حفظ</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  generatorInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  generatorName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  capacity: {
    fontSize: 16,
    color: '#FFC107',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 14,
    color: '#ccc',
  },
  notes: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
  },
  input: {
    marginBottom: 12,
  },
});